/**
 * Express application setup — middleware stack & route mounting.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('./middleware/auth');
const logger = require('./utils/logger');
const asyncLocalStorage = require('./utils/asyncContext');

const app = express();

// ── Async Context ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  asyncLocalStorage.run(req, () => {
    next();
  });
});

// ── Security ──────────────────────────────────────────────────────────
app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, same-origin)
      if (!origin) return callback(null, true);
      // Allow configured origins
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow any LAN origin during development (192.168.x.x, 10.x.x.x, etc.)
      if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error('CORS not allowed'));
    },
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
app.use(cookieParser());

// ── Request Logging ───────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.http(`${req.method} ${req.url}`);
  next();
});

// ── API Routes ────────────────────────────────────────────────────────
app.use('/api/health', require('./routes/health'));      // Public — health check
app.use('/api/auth',   require('./routes/auth'));        // Public — login/logout/session
app.use('/api/system', requireAuth, require('./routes/system'));  // Protected
app.use('/api/rdp',    requireAuth, require('./routes/rdp'));     // Protected
app.use('/api/storage',    requireAuth, require('./routes/storage'));    // Protected
app.use('/api/disks',      requireAuth, require('./routes/disks'));      // Protected
app.use('/api/services',   requireAuth, require('./routes/services'));   // Protected
app.use('/api/containers', requireAuth, require('./routes/containers')); // Protected
app.use('/api/accounts',   requireAuth, require('./routes/accounts'));   // Protected
app.use('/api/diagnostics', requireAuth, require('./routes/diagnostics')); // Protected

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
