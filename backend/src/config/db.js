const { Pool } = require('pg');

// Read credentials from environment variables — never hardcode secrets in source
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
});

module.exports = pool;
