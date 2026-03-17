const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { writeLimiter }     = require('../middleware/limiters');
const { operationalError } = require('../utils/errors');
const { PAGE_LIMIT }       = require('../config/env');

const CUSTOMER_COLS = 'id, name, email, phone, created_at';
const EMAIL_RE      = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || PAGE_LIMIT, 100);
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT ${CUSTOMER_COLS} FROM customers ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query('SELECT COUNT(*) FROM customers'),
    ]);

    res.json({
      data:  dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const { name } = req.query;
    if (!name || name.trim().length < 2)
      return next(operationalError(400, 'Search term must be at least 2 characters'));

    const result = await pool.query(
      `SELECT ${CUSTOMER_COLS} FROM customers WHERE name ILIKE $1 ORDER BY name`,
      [`%${name.trim()}%`]
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ${CUSTOMER_COLS} FROM customers WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return next(operationalError(404, 'Customer not found'));
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/', writeLimiter, async (req, res, next) => {
  try {
    const { name, email, phone } = req.body;

    const errors = [];
    if (!name || typeof name !== 'string' || !name.trim())
      errors.push('name is required and must be a non-empty string');
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim()))
      errors.push('email is required and must be a valid email address');
    if (phone !== undefined && phone !== null && typeof phone !== 'string')
      errors.push('phone must be a string');
    if (errors.length) return next(operationalError(400, errors.join('; ')));

    const result = await pool.query(
      'INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), email.trim().toLowerCase(), phone || null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return next(operationalError(409, 'A customer with this email already exists'));
    next(err);
  }
});

module.exports = router;
