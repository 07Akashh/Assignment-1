const { Pool } = require('pg');

// Prefer a single DATABASE_URL if provided (Render/Fly/etc), otherwise fall back to local defaults.
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      user: 'admin',
      password: 'admin123',
      host: 'db',
      port: 5432,
      database: 'orderdb',
    });

module.exports = pool;
