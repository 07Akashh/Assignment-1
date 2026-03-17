const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { writeLimiter } = require('../middleware/limiters');

const PAGE_LIMIT = parseInt(process.env.PAGE_LIMIT || '50');

// Get all orders
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || PAGE_LIMIT, 100);
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
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

// Get single order
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT o.*, c.name as customer_name, c.email as customer_email,
              p.name as product_name
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       JOIN products p ON o.product_id = p.id
       WHERE o.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      const err = new Error('Order not found');
      err.status = 404; err.isOperational = true;
      return next(err);
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Create order
router.post('/', writeLimiter, async (req, res, next) => {
  const { customer_id, product_id, quantity, shipping_address } = req.body;

  const errors = [];
  if (customer_id == null || !Number.isInteger(customer_id) || customer_id < 1) {
    errors.push('customer_id must be a positive integer');
  }
  if (product_id == null || !Number.isInteger(product_id) || product_id < 1) {
    errors.push('product_id must be a positive integer');
  }
  if (quantity == null || !Number.isInteger(quantity) || quantity < 1) {
    errors.push('quantity must be a positive integer');
  }
  if (!shipping_address || typeof shipping_address !== 'string' || !shipping_address.trim()) {
    errors.push('shipping_address is required and must be a non-empty string');
  }
  if (errors.length) {
    const err = new Error(errors.join('; '));
    err.status = 400;
    err.isOperational = true;
    return next(err);
  }

  try {
    const result = await pool.query(
      `WITH reserved AS (
         UPDATE products
         SET    inventory_count = inventory_count - $1
         WHERE  id = $2
           AND  inventory_count >= $1
         RETURNING id, price, inventory_count AS remaining
       ),
       product_exists AS (
         SELECT id FROM products WHERE id = $2
       ),
       new_order AS (
         INSERT INTO orders (customer_id, product_id, quantity, unit_price, total_amount, shipping_address, status)
         SELECT $3, $2, $1, r.price, r.price * $1, $4, 'pending'
         FROM   reserved r
         RETURNING *
       )
       SELECT
         o.*,
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
      if (row.rows.length === 0) {
        const err = new Error('Product not found');
        err.status = 404;
        err.isOperational = true;
        return next(err);
      }
      const err = new Error(`Insufficient inventory — only ${row.rows[0].inventory_count} unit(s) available`);
      err.status = 400;
      err.isOperational = true;
      return next(err);
    }

    const { _result, ...order } = result.rows[0];
    res.status(201).json({ data: order });
  } catch (err) {
    next(err);
  }
});

const VALID_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const ALLOWED_TRANSITIONS = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['shipped',   'cancelled'],
  shipped:   ['delivered'],
  delivered: [],
  cancelled: [],
};

// Update order status
router.patch('/:id/status', writeLimiter, async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      const err = new Error('status is required');
      err.status = 400;
      err.isOperational = true;
      return next(err);
    }

    if (!VALID_STATUSES.includes(status)) {
      const err = new Error(`Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`);
      err.status = 400;
      err.isOperational = true;
      return next(err);
    }

    const current = await pool.query('SELECT status FROM orders WHERE id = $1', [req.params.id]);
    if (current.rows.length === 0) {
      const err = new Error('Order not found');
      err.status = 404;
      err.isOperational = true;
      return next(err);
    }

    const currentStatus = current.rows[0].status;
    if (!ALLOWED_TRANSITIONS[currentStatus].includes(status)) {
      const err = new Error(
        `Cannot transition order from "${currentStatus}" to "${status}". ` +
        `Allowed: ${ALLOWED_TRANSITIONS[currentStatus].join(', ') || 'none'}`
      );
      err.status = 422;
      err.isOperational = true;
      return next(err);
    }

    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
