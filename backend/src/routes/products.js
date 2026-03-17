const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { writeLimiter } = require('../middleware/limiters');

// Get all products
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Update product inventory by a signed delta
router.patch('/:id/inventory', writeLimiter, async (req, res, next) => {
  const { adjustment } = req.body;

  if (adjustment == null || !Number.isInteger(adjustment) || adjustment === 0) {
    const err = new Error('adjustment must be a non-zero integer (positive to restock, negative to correct)');
    err.status = 400;
    err.isOperational = true;
    return next(err);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      'SELECT inventory_count FROM products WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (current.rows.length === 0) {
      const err = new Error('Product not found');
      err.status = 404;
      err.isOperational = true;
      throw err;
    }

    const newCount = current.rows[0].inventory_count + adjustment;
    if (newCount < 0) {
      const err = new Error(
        `Adjustment would push inventory to ${newCount}. ` +
        `Current stock is ${current.rows[0].inventory_count}.`
      );
      err.status = 422;
      err.isOperational = true;
      throw err;
    }

    const result = await client.query(
      'UPDATE products SET inventory_count = $1 WHERE id = $2 RETURNING *',
      [newCount, req.params.id]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
