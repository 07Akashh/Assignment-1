const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Get all orders
// BUG: N+1 query - fetches customer and product names in a loop
router.get('/', async (req, res) => {
  try {
    const ordersResult = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    const orders = ordersResult.rows;

    // Fetch customer and product details for each order individually
    const enrichedOrders = [];
    for (const order of orders) {
      const customerResult = await pool.query('SELECT name, email FROM customers WHERE id = $1', [order.customer_id]);
      const productResult = await pool.query('SELECT name, price FROM products WHERE id = $1', [order.product_id]);

      enrichedOrders.push({
        ...order,
        customer_name: customerResult.rows[0]?.name || 'Unknown',
        customer_email: customerResult.rows[0]?.email || '',
        product_name: productResult.rows[0]?.name || 'Unknown',
        product_price: productResult.rows[0]?.price || 0,
      });
    }

    res.json(enrichedOrders);
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

// Create order
router.post('/', async (req, res, next) => {
  const { customer_id, product_id, quantity, shipping_address } = req.body;

  const missing = ['customer_id', 'product_id', 'quantity', 'shipping_address']
    .filter(f => req.body[f] == null);
  if (missing.length) {
    const err = new Error(`Missing required fields: ${missing.join(', ')}`);
    err.status = 400;
    err.isOperational = true;
    return next(err);
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    const err = new Error('quantity must be a positive integer');
    err.status = 400;
    err.isOperational = true;
    return next(err);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the product row so concurrent requests queue here
    const productResult = await client.query(
      'SELECT * FROM products WHERE id = $1 FOR UPDATE',
      [product_id]
    );
    if (productResult.rows.length === 0) {
      const err = new Error('Product not found');
      err.status = 404;
      err.isOperational = true;
      throw err;
    }

    const product = productResult.rows[0];

    if (product.inventory_count < quantity) {
      const err = new Error(`Insufficient inventory — only ${product.inventory_count} unit(s) available`);
      err.status = 400;
      err.isOperational = true;
      throw err;
    }

    const total_amount = product.price * quantity;

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, product_id, quantity, total_amount, shipping_address, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [customer_id, product_id, quantity, total_amount, shipping_address]
    );

    await client.query(
      'UPDATE products SET inventory_count = inventory_count - $1 WHERE id = $2',
      [quantity, product_id]
    );

    await client.query('COMMIT');
    res.status(201).json(orderResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// Update order status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    // BUG: No validation on status transitions - can go from 'delivered' back to 'pending'
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

module.exports = router;
