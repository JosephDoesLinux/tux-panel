/**
 * /api/rdp — Remote Desktop (VNC) endpoints
 *
 *   GET  /api/rdp/status        Desktop env + VNC server status + krfbrc config
 *   GET  /api/rdp/capabilities  Full list of detected providers
 *   POST /api/rdp/connect       Verify VNC availability before WebSocket connect
 */

import { Router, Request, Response, NextFunction } from 'express';
import { detectCapabilities, getActiveConnection } from '../services/desktopService';
import logger from '../utils/logger';

const router = Router();

// ── GET /api/rdp/status ──────────────────────────────────────────────
// Returns desktop environment info, available providers, and running state.
router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const connection = await getActiveConnection();

    res.json({
      ...connection,
      vncProxy: 'ready',
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/rdp/capabilities ────────────────────────────────────────
// Full list of detected providers.
router.get('/capabilities', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const caps = await detectCapabilities();
    res.json(caps);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/rdp/connect ────────────────────────────────────────────
// Ensure VNC proxy is available
router.post('/connect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get the active local session as defaults
    const connection: any = await getActiveConnection();

    if (connection.status === 'unavailable') {
      return res.status(404).json({
        error: 'No VNC server is available on this system.',
        desktop: connection.desktop,
      });
    }

    if (connection.status === 'not-running') {
      return res.status(503).json({
        error: connection.message,
        provider: connection.bestProvider,
      });
    }

    const host = connection.provider?.host || '127.0.0.1';
    const port = connection.provider?.port || 5900;

    logger.info(`VNC connection verified → proxying to ${host}:${port} [user: ${req.user?.sub || 'unknown'}]`);

    res.json({
      wsUrl: '/vnc',
      protocol: connection.provider?.protocol || 'vnc',
      host,
      port,
    });
  } catch (err) {
    logger.error('Error verifying VNC connection: ' + (err as Error).message);
    next(err);
  }
});

export default router;
