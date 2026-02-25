/**
 * /api/rdp — Remote Desktop endpoints
 *
 *   GET  /api/rdp/status    Desktop env info + RDP server status
 *   POST /api/rdp/connect   Generate a guacamole connection token
 */

import { Router, Request, Response, NextFunction } from 'express';
import { detectCapabilities, getActiveConnection  } from '../services/desktopService';
import * as guacService from '../services/guacService';
import logger from '../utils/logger';

const router = Router();

// ── GET /api/rdp/status ──────────────────────────────────────────────
// Returns desktop environment info, available providers, and running state.
router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const connection = await getActiveConnection();
    const guacReady = guacService.isReady();

    res.json({
      ...connection,
      guacProxy: guacReady ? 'ready' : 'not-initialised',
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
// Generates an encrypted connection token for the guacamole WebSocket.
//
// Body (all optional — defaults to the active local session):
//   { hostname, port, protocol, username, password, width, height, dpi }
router.post('/connect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!guacService.isReady()) {
      return res.status(503).json({
        error: 'Guacamole proxy not available. Is guacd running?',
        hint: 'Run: sudo systemctl start guacd',
      });
    }

    // Get the active local session as defaults
    const connection = await getActiveConnection();

    if (connection.status === 'unavailable') {
      return res.status(404).json({
        error: 'No RDP/VNC server is available on this system.',
        desktop: connection.desktop,
      });
    }

    if (connection.status === 'not-running') {
      return res.status(503).json({
        error: connection.message,
        provider: connection.bestProvider,
      });
    }

    // Merge request body with detected defaults
    const params = {
      protocol: req.body.protocol || (connection as any).provider?.protocol,
      hostname: req.body.hostname || (connection as any).provider?.host,
      port: req.body.port || (connection as any).provider?.port,
      username: req.body.username,
      password: req.body.password,
      width: req.body.width || undefined,
      height: req.body.height || undefined,
      dpi: req.body.dpi || undefined,
    };

    // krdpserver requires credentials — guacamole-lite cannot relay
    // guacd's "required" instruction, so they must be baked into the token.
    if (!params.username || !params.password) {
      return res.status(400).json({
        error: 'Username and password are required for RDP authentication.',
      });
    }

    const token = guacService.generateToken(params);

    logger.info(`RDP token generated → ${params.protocol}://${params.hostname}:${params.port} (user=${params.username || '<none>'})`);

    res.json({
      token,
      wsUrl: '/guacamole',
      protocol: params.protocol,
      hostname: params.hostname,
      port: params.port,
      provider: (connection as any).provider?.name,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
