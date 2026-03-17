const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { asyncHandler } = require("../lib/asynchandler");

// Get all customers
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM customers ORDER BY created_at DESC",
    );
    res.json(result.rows);
  }),
);

// Search customers by name
// BUG: SQL injection - uses string concatenation instead of parameterized query
router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const { name } = req.query;
    const result = await pool.query(
      "SELECT * FROM customers WHERE name ILIKE $1",
      [`%${name}%`],
    );
    return res.json(result.rows);
  }),
);

// Get single customer
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await pool.query("SELECT * FROM customers WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }
    return res.json(result.rows[0]);
  }),
);

// Create customer - BUG: no input validation at all
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, email, phone } = req.body;
    if (!name || !email || !phone) {
      // user details validation
      return res.status(400).json({ erro: "All the details are required" });
    }
    const result = await pool.query(
      "INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING *",
      [name, email, phone],
    );
    return res.json(result.rows[0]);
  }),
);

module.exports = router;
