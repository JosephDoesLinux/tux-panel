/**
 * Express application setup — middleware stack & route mounting.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

const app = express();

// ── Security ──────────────────────────────────────────────────────────
app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// ── Rate Limiting ─────────────────────────────────────────────────────
app.use(
  rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60_000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ── Body Parsers ──────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Request Logging ───────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.http(`${req.method} ${req.url}`);
  next();
});

// ── API Routes ────────────────────────────────────────────────────────
app.use('/api/health', require('./routes/health'));
app.use('/api/system', require('./routes/system'));
app.use('/api/rdp',    require('./routes/rdp'));
// Phase 2
// app.use('/api/users',   require('./routes/users'));
// app.use('/api/shares',  require('./routes/shares'));

// ── Catch-All 404 ────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error(err.stack || err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

module.exports = app;
