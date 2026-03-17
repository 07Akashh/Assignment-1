const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { writeLimiter }      = require('../middleware/limiters');
const { operationalError }  = require('../utils/errors');
const { PAGE_LIMIT }        = require('../config/env');
const {
  VALID_STATUSES,
  ALLOWED_TRANSITIONS,
  ALLOWED_TRANSITIONS_REVERSE,
} = require('../constants/orders');

router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || PAGE_LIMIT, 100);
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT o.*,
                c.name  AS customer_name,
                c.email AS customer_email,
                p.name  AS product_name
         FROM orders o
         JOIN customers c ON o.customer_id = c.id
         JOIN products  p ON o.product_id  = p.id
         ORDER BY o.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query('SELECT COUNT(*) FROM orders'),
    ]);

    res.json({
      data:  dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT o.*, c.name AS customer_name, c.email AS customer_email, p.name AS product_name
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       JOIN products  p ON o.product_id  = p.id
       WHERE o.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return next(operationalError(404, 'Order not found'));
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/', writeLimiter, async (req, res, next) => {
  const { customer_id, product_id, quantity, shipping_address } = req.body;

  const errors = [];
  if (customer_id == null || !Number.isInteger(customer_id) || customer_id < 1)
    errors.push('customer_id must be a positive integer');
  if (product_id == null || !Number.isInteger(product_id) || product_id < 1)
    errors.push('product_id must be a positive integer');
  if (quantity == null || !Number.isInteger(quantity) || quantity < 1)
    errors.push('quantity must be a positive integer');
  if (!shipping_address || typeof shipping_address !== 'string' || !shipping_address.trim())
    errors.push('shipping_address is required and must be a non-empty string');
  if (errors.length) return next(operationalError(400, errors.join('; ')));

  try {
    const result = await pool.query(
      `WITH reserved AS (
         UPDATE products
         SET    inventory_count = inventory_count - $1
         WHERE  id = $2 AND inventory_count >= $1
         RETURNING id, price
       ),
       product_exists AS (SELECT id FROM products WHERE id = $2),
       new_order AS (
         INSERT INTO orders (customer_id, product_id, quantity, unit_price, total_amount, shipping_address, status)
         SELECT $3, $2, $1, r.price, r.price * $1, $4, 'pending'
         FROM   reserved r
         RETURNING *
       )
       SELECT o.*,
         CASE
           WHEN NOT EXISTS (SELECT 1 FROM product_exists) THEN 'not_found'
           WHEN NOT EXISTS (SELECT 1 FROM reserved)       THEN 'insufficient'
           ELSE 'ok'
         END AS _result
       FROM new_order o`,
      [quantity, product_id, customer_id, shipping_address]
    );

    if (result.rows.length === 0) {
      const row = await pool.query('SELECT inventory_count FROM products WHERE id = $1', [product_id]);
      if (row.rows.length === 0) return next(operationalError(404, 'Product not found'));
      return next(operationalError(400, `Insufficient inventory — only ${row.rows[0].inventory_count} unit(s) available`));
    }

    const { _result, ...order } = result.rows[0];
    res.status(201).json({ data: order });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', writeLimiter, async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status)
      return next(operationalError(400, 'status is required'));
    if (!VALID_STATUSES.includes(status))
      return next(operationalError(400, `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`));

    const validPriorStatuses = ALLOWED_TRANSITIONS_REVERSE[status];
    if (!validPriorStatuses)
      return next(operationalError(422, `"${status}" is not reachable from any state`));

    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 AND status = ANY($3) RETURNING *',
      [status, req.params.id, validPriorStatuses]
    );

    if (result.rows.length === 0) {
      const check = await pool.query('SELECT status FROM orders WHERE id = $1', [req.params.id]);
      if (check.rows.length === 0) return next(operationalError(404, 'Order not found'));
      return next(operationalError(422,
        `Cannot transition order from "${check.rows[0].status}" to "${status}". ` +
        `Allowed: ${ALLOWED_TRANSITIONS[check.rows[0].status].join(', ') || 'none'}`
      ));
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', writeLimiter, async (req, res, next) => {
  try {
    const result = await pool.query(
      `WITH cancelled AS (
         UPDATE orders
         SET    status = 'cancelled'
         WHERE  id = $1 AND status = ANY(ARRAY['pending', 'confirmed'])
         RETURNING *
       ),
       _restored AS (
         UPDATE products
         SET    inventory_count = inventory_count + c.quantity
         FROM   cancelled c
         WHERE  products.id = c.product_id
       )
       SELECT * FROM cancelled`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      const check = await pool.query('SELECT status FROM orders WHERE id = $1', [req.params.id]);
      if (check.rows.length === 0) return next(operationalError(404, 'Order not found'));
      const current = check.rows[0].status;
      return next(operationalError(422,
        current === 'cancelled'
          ? 'Order is already cancelled'
          : `Order cannot be cancelled — current status is "${current}". Only pending or confirmed orders may be cancelled.`
      ));
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
