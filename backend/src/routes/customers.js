const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Get all customers
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Search customers by name (parameterized query to prevent SQL injection)
router.get('/search', async (req, res) => {
  try {
    const { name } = req.query;
    if (name == null || String(name).trim() === '') {
      return res.status(400).json({ error: 'Search term required' });
    }
    const result = await pool.query(
      'SELECT * FROM customers WHERE name ILIKE $1',
      ['%' + String(name).trim() + '%']
    );
    res.json(result.rows);
  } catch (_err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get single customer
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(result.rows[0]);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Create customer - BUG: no input validation at all
router.post('/', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const result = await pool.query(
      'INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING *',
      [name, email, phone]
    );
    res.json(result.rows[0]);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

module.exports = router;
