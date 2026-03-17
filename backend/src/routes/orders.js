const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { asyncHandler } = require("../lib/asynchandler");

// Get all orders
// BUG: N+1 query - fetches customer and product names in a loop
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const ordersResult = await pool.query(`
      SELECT 
        o.id,
        o.quantity,
        o.total_amount,
        o.status,
        o.shipping_address,
        o.created_at,
        o.updated_at,

        c.id AS customer_id,
        c.name AS customer_name,
        c.email AS customer_email,

        p.id AS product_id,
        p.name AS product_name,
        p.price AS product_price

      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN products p ON o.product_id = p.id

      ORDER BY o.created_at DESC
    `);

    return res.json(ordersResult.rows);
  }),
);

// Get single order
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT o.*, c.name as customer_name, c.email as customer_email, 
              p.name as product_name, p.price as product_price
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       JOIN products p ON o.product_id = p.id
       WHERE o.id = $1`,
      [req.params.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    return res.json(result.rows[0]);
  }),
);

// Create order
// BUG: Race condition - read inventory, then decrement separately. Two concurrent
// requests can both read inventory=1, both pass the check, and both decrement.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { customer_id, product_id, quantity, shipping_address } = req.body;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const productResult = await client.query(
        "SELECT * FROM products WHERE id = $1 FOR UPDATE",
        [product_id],
      );

      if (productResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Product not found" });
      }

      const product = productResult.rows[0];

      if (product.inventory_count < quantity) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Insufficient inventory" });
      }

      const total_amount = product.price * quantity;

      const orderResult = await client.query(
        `INSERT INTO orders 
        (customer_id, product_id, quantity, total_amount, shipping_address, status)
        VALUES ($1, $2, $3, $4, $5, 'pending') 
        RETURNING *`,
        [customer_id, product_id, quantity, total_amount, shipping_address],
      );

      await client.query(
        "UPDATE products SET inventory_count = inventory_count - $1 WHERE id = $2",
        [quantity, product_id],
      );

      await client.query("COMMIT");

      return res.json(orderResult.rows[0]);
    } finally {
      client.release();
    }
  }),
);

// Update order status
router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    console.log("this is  from body", status);

    // BUG: No validation on status transitions - can go from 'delivered' back to 'pending'
    // const result = await pool.query(
    //   "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    //   [status, req.params.id],
    // );
    // if (result.rows.length === 0) {
    //   return res.status(404).json({ error: "Order not found" });
    // }
    // return res.json(result.rows[0]);

    const allowedStatuses = [
      "pending",
      "shipped",
      "delivered",
      "cancelled",
      "confirmed",
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const existing = await pool.query(
      "SELECT status FROM orders WHERE id = $1",
      [req.params.id],
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const currentStatus = existing.rows[0].status;
    console.log("this is ", currentStatus);

    const validTransitions = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: [],
      cancelled: [],
    };
    console.log("before validtra");
    if (!validTransitions[currentStatus].includes(status)) {
      return res.status(400).json({
        error: `Invalid transition from ${currentStatus} to ${status}`,
      });
    }
    console.log("after includes");

    const result = await pool.query(
      "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [status, req.params.id],
    );
    return res.json(result.rows[0]);
  }),
);

module.exports = router;

router.patch(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1️⃣ Get order with lock
      const orderResult = await client.query(
        "SELECT * FROM orders WHERE id = $1 FOR UPDATE",
        [req.params.id],
      );

      if (orderResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Order not found" });
      }

      const order = orderResult.rows[0];

      //Check if cancellable
      if (order.status === "delivered") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Delivered orders cannot be cancelled",
        });
      }

      if (order.status === "cancelled") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Order is already cancelled",
        });
      }

      //  Update order status
      const updatedOrder = await client.query(
        "UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *",
        [req.params.id],
      );

      // Restore inventory
      await client.query(
        "UPDATE products SET inventory_count = inventory_count + $1 WHERE id = $2",
        [order.quantity, order.product_id],
      );

      await client.query("COMMIT");

      return res.json(updatedOrder.rows[0]);
    } finally {
      client.release();
    }
  }),
);

// return was missing in all the controllers, req res cycle must be closed after sending the response to prevent bugs
