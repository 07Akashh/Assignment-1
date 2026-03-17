const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Get all customers
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Search customers by name
router.get('/search', async (req, res) => {
  try {
    const { name } = req.query;
    const result = await pool.query(
      'SELECT * FROM customers WHERE name ILIKE $1',
      [`%${name}%`]
    );
    res.json(result.rows);
  } catch (err) {
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
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Create customer
router.post('/', async (req, res, next) => {
  try {
    const { name, email, phone } = req.body;

    const errors = [];
    if (!name || typeof name !== 'string' || !name.trim()) {
      errors.push('name is required and must be a non-empty string');
    }
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      errors.push('email is required and must be a valid email address');
    }
    if (phone !== undefined && phone !== null && typeof phone !== 'string') {
      errors.push('phone must be a string');
    }
    if (errors.length) {
      const err = new Error(errors.join('; '));
      err.status = 400;
      err.isOperational = true;
      return next(err);
    }

    const result = await pool.query(
      'INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), email.trim().toLowerCase(), phone || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      const e = new Error('A customer with this email already exists');
      e.status = 409;
      e.isOperational = true;
      return next(e);
    }
    next(err);
  }
});

module.exports = router;
