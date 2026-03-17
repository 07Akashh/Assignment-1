const rateLimit = require('express-rate-limit');

const MESSAGE = { error: 'Too many requests, please try again in a minute.' };

const readLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_READ_MAX || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: MESSAGE,
});

const writeLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_WRITE_MAX || '20'),
  standardHeaders: true,
  legacyHeaders: false,
  message: MESSAGE,
});

module.exports = { readLimiter, writeLimiter };
