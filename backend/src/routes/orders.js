const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Get all orders (single query with JOINs to avoid N+1)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, c.name AS customer_name, c.email AS customer_email,
              p.name AS product_name, p.price AS product_price
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN products p ON o.product_id = p.id
       ORDER BY o.created_at DESC`
    );
    res.json(result.rows);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, c.name as customer_name, c.email as customer_email, 
              p.name as product_name, p.price as product_price
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       JOIN products p ON o.product_id = p.id
       WHERE o.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(result.rows[0]);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create order (atomic inventory decrement to prevent race / oversell)
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_id, product_id, quantity, shipping_address } = req.body;

    const productResult = await client.query('SELECT * FROM products WHERE id = $1', [product_id]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await client.query('BEGIN');

    // Atomic decrement: only succeeds if enough stock; prevents oversell under concurrency
    const updateResult = await client.query(
      `UPDATE products SET inventory_count = inventory_count - $1
       WHERE id = $2 AND inventory_count >= $1
       RETURNING *`,
      [quantity, product_id]
    );
    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient inventory' });
    }

    const product = updateResult.rows[0];
    const total_amount = product.price * quantity;

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, product_id, quantity, total_amount, shipping_address, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [customer_id, product_id, quantity, total_amount, shipping_address]
    );

    await client.query('COMMIT');
    res.json(orderResult.rows[0]);
  } catch (_err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    client.release();
  }
});

// Update order status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(result.rows[0]);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Cancel order (only pending or confirmed; restores inventory)
router.post('/:id/cancel', async (req, res) => {
  const client = await pool.connect();
  try {
    const orderId = req.params.id;
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderResult.rows[0];
    const status = order.status;
    if (status !== 'pending' && status !== 'confirmed') {
      return res.status(400).json({
        error: 'Only pending or confirmed orders can be cancelled',
      });
    }
    await client.query('BEGIN');
    await client.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
      ['cancelled', orderId]
    );
    await client.query(
      'UPDATE products SET inventory_count = inventory_count + $1 WHERE id = $2',
      [order.quantity, order.product_id]
    );
    await client.query('COMMIT');
    const updated = await client.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );
    res.json(updated.rows[0]);
  } catch (_err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: 'Failed to cancel order' });
  } finally {
    client.release();
  }
});

module.exports = router;
