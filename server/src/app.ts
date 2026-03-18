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
import { corsOriginValidator } from './utils/cors';

import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import systemRoutes from './routes/system';
import rdpRoutes from './routes/rdp';
import disksRoutes from './routes/disks';
import servicesRoutes from './routes/services';
import containersRoutes from './routes/containers';
import accountsRoutes from './routes/accounts';
import diagnosticsRoutes from './routes/diagnostics';
import aiRoutes from './routes/ai';
import path from 'path';

const app = express();

// ── Async Context ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  asyncLocalStorage.run(req, () => {
    next();
  });
});

// ── Security ──────────────────────────────────────────────────────────
app.use(helmet());

app.use(
  cors({
    origin: corsOriginValidator,
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
app.use('/api/disks',      requireAuth, disksRoutes);      // Protected
app.use('/api/services',   requireAuth, servicesRoutes);   // Protected
app.use('/api/containers', requireAuth, containersRoutes); // Protected
app.use('/api/accounts',   requireAuth, accountsRoutes);   // Protected
app.use('/api/diagnostics', requireAuth, diagnosticsRoutes); // Protected
app.use('/api/ai',         requireAuth, aiRoutes);         // Protected

// ── Serve Frontend ────────────────────────────────────────────────────
// In production (or when packaged), we serve the built Vue/Vite client.
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

app.get('*', (req, res, next) => {
  // Let API and Socket.io fall through to 404/Error handlers if not caught above
  if (req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/socket.io/')) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

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
