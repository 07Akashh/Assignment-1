const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { asyncHandler } = require("../lib/asynchandler");

// Get all products
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await pool.query("SELECT * FROM products ORDER BY name");
    return res.json(result.rows);
  }),
);

// Get single product
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await pool.query("SELECT * FROM products WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    return res.json(result.rows[0]);
  }),
);

// Update product inventory
router.patch(
  "/:id/inventory",
  asyncHandler(async (req, res) => {
    const { inventory_count } = req.body;
    const result = await pool.query(
      "UPDATE products SET inventory_count = $1 WHERE id = $2 RETURNING *",
      [inventory_count, req.params.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    return res.json(result.rows[0]);
  }),
);

module.exports = router;
