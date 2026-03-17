const http    = require('http');
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const morgan  = require('morgan');
const pool    = require('./config/db');
const { PORT }        = require('./config/env');
const { readLimiter } = require('./middleware/limiters');
const customerRoutes  = require('./routes/customers');
const productRoutes   = require('./routes/products');
const orderRoutes     = require('./routes/orders');

const app = express();

app.use(helmet());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(Object.assign(new Error('Not allowed by CORS'), { status: 403 }));
  },
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());

app.use('/api/customers', readLimiter, customerRoutes);
app.use('/api/products',  readLimiter, productRoutes);
app.use('/api/orders',    readLimiter, orderRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch {
    res.status(503).json({ status: 'ok', db: 'unreachable' });
  }
});

app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  console.error({ message: err.message, stack: err.stack, method: req.method, path: req.path, status });
  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? (err.isOperational ? err.message : (http.STATUS_CODES[status] || 'Internal Server Error'))
      : err.message,
  });
});

const server = http.createServer(app);

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully');
  server.close(async () => {
    await pool.end();
    console.log('DB pool drained — process exiting');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000'));
});
