/**
 * Express application setup — middleware stack & route mounting.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { requireAuth  } from './middleware/auth';
import logger from './utils/logger';
import asyncLocalStorage from './utils/asyncContext';

import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import systemRoutes from './routes/system';
import rdpRoutes from './routes/rdp';
import storageRoutes from './routes/storage';
import disksRoutes from './routes/disks';
import servicesRoutes from './routes/services';
import containersRoutes from './routes/containers';
import accountsRoutes from './routes/accounts';
import diagnosticsRoutes from './routes/diagnostics';
import aiRoutes from './routes/ai';

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
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
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
app.use('/api/health', healthRoutes);      // Public — health check
app.use('/api/auth',   authRoutes);        // Public — login/logout/session
app.use('/api/system', requireAuth, systemRoutes);  // Protected
app.use('/api/rdp',    requireAuth, rdpRoutes);     // Protected
app.use('/api/storage',    requireAuth, storageRoutes);    // Protected
app.use('/api/disks',      requireAuth, disksRoutes);      // Protected
app.use('/api/services',   requireAuth, servicesRoutes);   // Protected
app.use('/api/containers', requireAuth, containersRoutes); // Protected
app.use('/api/accounts',   requireAuth, accountsRoutes);   // Protected
app.use('/api/diagnostics', requireAuth, diagnosticsRoutes); // Protected
app.use('/api/ai',         requireAuth, aiRoutes);         // Protected

// ── Catch-All 404 ────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err.stack || err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

export default app;
