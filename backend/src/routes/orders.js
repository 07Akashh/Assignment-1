const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const ALLOWED_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered'];
const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

// Get all orders
router.get('/', async (req, res) => {
  try {
    const ordersResult = await pool.query(
      `SELECT o.*, c.name as customer_name, c.email as customer_email,
              p.name as product_name, p.price as product_price
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN products p ON o.product_id = p.id
       ORDER BY o.created_at DESC`
    );
    res.json(ordersResult.rows);
  } catch (err) {
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create order
router.post('/', async (req, res) => {
  const { customer_id, product_id, quantity, shipping_address } = req.body;
  const customerId = Number.parseInt(customer_id, 10);
  const productId = Number.parseInt(product_id, 10);
  const qty = Number.parseInt(quantity, 10);

  if (!customerId || !productId || !shipping_address) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Invalid quantity' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productResult = await client.query(
      'SELECT id, price, inventory_count FROM products WHERE id = $1 FOR UPDATE',
      [productId]
    );
    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productResult.rows[0];
    if (product.inventory_count < qty) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient inventory' });
    }

    const total_amount = Number(product.price) * qty;

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, product_id, quantity, total_amount, shipping_address, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [customerId, productId, qty, total_amount, shipping_address]
    );

    await client.query(
      'UPDATE products SET inventory_count = inventory_count - $1 WHERE id = $2',
      [qty, productId]
    );

    await client.query('COMMIT');
    res.status(201).json(orderResult.rows[0]);
  } catch (err) {
    console.error(err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    client.release();
  }
});

// Cancel order
router.post('/:id/cancel', async (req, res) => {
  const orderId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(orderId)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      'SELECT id, status, product_id, quantity FROM orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Order cannot be cancelled from status "${order.status}"` });
    }

    await client.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
      ['cancelled', orderId]
    );
    await client.query(
      'UPDATE products SET inventory_count = inventory_count + $1 WHERE id = $2',
      [order.quantity, order.product_id]
    );

    await client.query('COMMIT');
    res.json({ success: true, order_id: orderId, status: 'cancelled' });
  } catch (err) {
    console.error(err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to cancel order' });
  } finally {
    client.release();
  }
});

// Update order status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const currentResult = await pool.query('SELECT status FROM orders WHERE id = $1', [req.params.id]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const currentStatus = currentResult.rows[0].status;
    if (currentStatus === 'cancelled') {
      return res.status(400).json({ error: 'Cancelled orders cannot be updated' });
    }

    const currentIndex = ALLOWED_STATUSES.indexOf(currentStatus);
    const nextIndex = ALLOWED_STATUSES.indexOf(status);
    if (nextIndex < currentIndex) {
      return res.status(400).json({ error: `Invalid status transition from "${currentStatus}" to "${status}"` });
    }

    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

module.exports = router;
