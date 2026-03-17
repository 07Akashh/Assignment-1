const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { writeLimiter }     = require('../middleware/limiters');
const { operationalError } = require('../utils/errors');

const PRODUCT_COLS      = 'id, name, description, price, inventory_count, created_at';
const PRODUCT_LIST_COLS = 'id, name, price, inventory_count, created_at';

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT ${PRODUCT_LIST_COLS} FROM products ORDER BY name`);
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ${PRODUCT_COLS} FROM products WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return next(operationalError(404, 'Product not found'));
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/inventory', writeLimiter, async (req, res, next) => {
  const { adjustment } = req.body;

  if (adjustment == null || !Number.isInteger(adjustment) || adjustment === 0)
    return next(operationalError(400, 'adjustment must be a non-zero integer (positive to restock, negative to correct)'));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      'SELECT inventory_count FROM products WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (current.rows.length === 0) throw operationalError(404, 'Product not found');

    const newCount = current.rows[0].inventory_count + adjustment;
    if (newCount < 0)
      throw operationalError(422,
        `Adjustment would push inventory to ${newCount}. Current stock is ${current.rows[0].inventory_count}.`
      );

    const result = await client.query(
      'UPDATE products SET inventory_count = $1 WHERE id = $2 RETURNING *',
      [newCount, req.params.id]
    );

    await client.query('COMMIT');
    res.json({ data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
