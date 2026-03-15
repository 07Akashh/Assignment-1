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
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_id, product_id, quantity, shipping_address } = req.body;

    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Quantity must be a positive integer' });
    }

    await client.query('BEGIN');

    // check stock and decrement in one go so two requests can't both grab the last item
    const inventoryResult = await client.query(
      `UPDATE products SET inventory_count = inventory_count - $1
       WHERE id = $2 AND inventory_count >= $1
       RETURNING price`,
      [quantity, product_id]
    );

    if (inventoryResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Product not found or insufficient inventory' });
    }

    const total_amount = inventoryResult.rows[0].price * quantity;

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, product_id, quantity, total_amount, shipping_address, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [customer_id, product_id, quantity, total_amount, shipping_address]
    );

    await client.query('COMMIT');
    res.status(201).json(orderResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to create order' });
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

// Cancel order - only pending/confirmed orders can be cancelled
router.post('/:id/cancel', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (orderResult.rows.length === 0) {
      console.warn(`Cancel attempt on non-existent order #${req.params.id}`);
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (order.status !== 'pending' && order.status !== 'confirmed') {
      console.warn(`Cancel rejected: order #${order.id} (customer #${order.customer_id}) is already ${order.status}`);
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot cancel an order that is already ${order.status}` });
    }

    // mark as cancelled
    await client.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
      ['cancelled', req.params.id]
    );

    // restore inventory
    await client.query(
      'UPDATE products SET inventory_count = inventory_count + $1 WHERE id = $2',
      [order.quantity, order.product_id]
    );

    await client.query('COMMIT');

    // fetch the updated order to return
    const updated = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Failed to cancel order #${req.params.id}:`, err.message);
    res.status(500).json({ error: 'Failed to cancel order' });
  } finally {
    client.release();
  }
});

module.exports = router;
