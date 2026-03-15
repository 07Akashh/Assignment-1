const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Get all orders — single JOIN query instead of N+1 loop
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, c.name AS customer_name, c.email AS customer_email,
              p.name AS product_name, p.price AS product_price
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       JOIN products p ON o.product_id = p.id
       ORDER BY o.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
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
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create order — uses a DB transaction with SELECT FOR UPDATE to prevent
// race conditions where two concurrent requests could both pass the inventory
// check and both decrement, resulting in negative inventory (oversell).
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_id, product_id, quantity, shipping_address } = req.body;

    await client.query('BEGIN');

    // Lock the product row so concurrent requests block until this transaction commits
    const productResult = await client.query(
      'SELECT * FROM products WHERE id = $1 FOR UPDATE',
      [product_id]
    );
    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productResult.rows[0];

    if (product.inventory_count < quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient inventory' });
    }

    const total_amount = product.price * quantity;

    // Create order
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, product_id, quantity, total_amount, shipping_address, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [customer_id, product_id, quantity, total_amount, shipping_address]
    );

    // Decrement inventory atomically within the same transaction
    await client.query(
      'UPDATE products SET inventory_count = inventory_count - $1 WHERE id = $2',
      [quantity, product_id]
    );

    await client.query('COMMIT');
    res.json(orderResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    client.release();
  }
});

// Update order status
const VALID_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Cancel order — only allowed for 'pending' or 'confirmed' orders.
// Atomically sets status to 'cancelled' and restores product inventory.
const CANCELLABLE_STATUSES = ['pending', 'confirmed'];
router.patch('/:id/cancel', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the order row to prevent concurrent cancellations
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Order cannot be cancelled. Only pending or confirmed orders can be cancelled. Current status: ${order.status}`,
      });
    }

    // Set order status to 'cancelled'
    const updatedOrder = await client.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      ['cancelled', req.params.id]
    );

    // Restore product inventory
    await client.query(
      'UPDATE products SET inventory_count = inventory_count + $1 WHERE id = $2',
      [order.quantity, order.product_id]
    );

    await client.query('COMMIT');
    res.json(updatedOrder.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to cancel order' });
  } finally {
    client.release();
  }
});

module.exports = router;
