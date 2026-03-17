const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
});

// Prevent unhandled 'error' events from crashing the process.
// pg.Pool reconnects automatically — this listener only keeps Node.js alive.
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

module.exports = pool;
