const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Get all orders
// BUG: N+1 query - fetches customer and product names in a loop
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_id, product_id, quantity, shipping_address } = req.body;
    if (!customer_id || !product_id || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid order data' });
    }

    await client.query('BEGIN');

    const updateResult = await client.query(
      `UPDATE products
       SET inventory_count = inventory_count - $1
       WHERE id = $2 AND inventory_count >= $1
       RETURNING id, inventory_count, price`,
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
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [customer_id, product_id, quantity, total_amount, shipping_address]
    );

    await client.query('COMMIT');
    res.json(orderResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    client.release();
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
// BUG: Race condition - read inventory, then decrement separately. Two concurrent
// requests can both read inventory=1, both pass the check, and both decrement.
router.post('/', async (req, res) => {
  try {
    const { customer_id, product_id, quantity, shipping_address } = req.body;

    // Check inventory
    const productResult = await pool.query('SELECT * FROM products WHERE id = $1', [product_id]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productResult.rows[0];

    if (product.inventory_count < quantity) {
      return res.status(400).json({ error: 'Insufficient inventory' });
    }

    const total_amount = product.price * quantity;

    // Create order
    const orderResult = await pool.query(
      `INSERT INTO orders (customer_id, product_id, quantity, total_amount, shipping_address, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [customer_id, product_id, quantity, total_amount, shipping_address]
    );

    // Decrement inventory
    await pool.query(
      'UPDATE products SET inventory_count = inventory_count - $1 WHERE id = $2',
      [quantity, product_id]
    );

    res.json(orderResult.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Update order status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
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
    console.error(err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Cancel order
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const orderId = req.params.id;
    await client.query('BEGIN');

    const orderResult = await client.query('SELECT id, product_id, quantity, status FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    if (!['pending', 'confirmed'].includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only pending or confirmed orders can be cancelled' });
    }

    // Restore inventory
    const updateProduct = await client.query(
      'UPDATE products SET inventory_count = inventory_count + $1 WHERE id = $2 RETURNING id',
      [order.quantity, order.product_id]
    );
    if (updateProduct.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Product not found for order' });
    }

    const cancelled = await client.query(
      "UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *",
      [orderId]
    );

    await client.query('COMMIT');
    res.json(cancelled.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to cancel order' });
  } finally {
    client.release();
  }
});

module.exports = router;
