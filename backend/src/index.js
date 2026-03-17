const http = require('http');
const express = require('express');
const cors = require('cors');
const customerRoutes = require('./routes/customers');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const { readLimiter } = require('./middleware/limiters');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(Object.assign(new Error('Not allowed by CORS'), { status: 403 }));
    }
  },
}));
app.use(express.json());

// Routes — readLimiter applied globally; writeLimiter applied per handler in each route file
app.use('/api/customers', readLimiter, customerRoutes);
app.use('/api/products', readLimiter, productRoutes);
app.use('/api/orders', readLimiter, orderRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  console.error({
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    status,
  });

  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? (err.isOperational ? err.message : (http.STATUS_CODES[status] || 'Internal Server Error'))
      : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
