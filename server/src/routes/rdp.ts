/**
 * /api/rdp — Remote Access Orchestrator
 *
 * Endpoints:
 *
 *   GET  /api/rdp/discover              Full scan: host + Docker VNC/RDP ports,
 *                                       available sessions, eligible users, capabilities
 *   GET  /api/rdp/status                Legacy compat — desktop env + active VNC provider
 *   GET  /api/rdp/capabilities          Legacy compat — detected VNC providers
 *
 *   POST /api/rdp/vnc/connect           Verify a VNC target and return the proxy wsUrl
 *   POST /api/rdp/vnc/spawn             Spawn a headless TigerVNC session for a user + DE
 *   POST /api/rdp/vnc/stop              Stop a TuxPanel-managed VNC session
 *   GET  /api/rdp/vnc/sessions          List all TuxPanel-managed VNC sessions
 *
 *   POST /api/rdp/rdp/connect           Verify an RDP target (guacd availability)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { detectCapabilities, getActiveConnection } from '../services/desktopService';
import {
  runFullDiscovery,
  scanHostPorts,
  scanDockerPorts,
  discoverSessions,
  discoverUsers,
  detectCapabilityBinaries,
} from '../services/discoveryService';
import {
  spawnSession,
  stopSession,
  listManagedSessions,
} from '../services/sessionSpawner';
import {
  startBridge,
  cleanupBridge,
  listBridges,
} from '../services/rdpBridgeService';
import logger from '../utils/logger';

const router = Router();

/* ══════════════════════════════════════════════════════════════════════
   Discovery
   ══════════════════════════════════════════════════════════════════════ */

// ── GET /api/rdp/discover ────────────────────────────────────────────
// Full discovery: host ports, Docker ports, xsessions, users, capabilities.
router.get('/discover', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await runFullDiscovery();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════════════════
   Legacy Compat (keep existing frontend working during migration)
   ══════════════════════════════════════════════════════════════════════ */

// ── GET /api/rdp/status ──────────────────────────────────────────────
router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const connection = await getActiveConnection();
    res.json({ ...connection, vncProxy: 'ready' });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/rdp/capabilities ────────────────────────────────────────
router.get('/capabilities', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const caps = await detectCapabilities();
    res.json(caps);
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════════════════
   VNC — Connect / Spawn / Stop
   ══════════════════════════════════════════════════════════════════════ */

// ── POST /api/rdp/vnc/connect ────────────────────────────────────────
// Verify a VNC target is reachable and return the proxy wsUrl.
// Body: { host?: string, port?: number }
// If host/port omitted, falls back to auto-detected active connection.
router.post('/vnc/connect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { host: reqHost, port: reqPort } = req.body || {};

    // If the caller specified a target, use it directly.
    if (reqHost || reqPort) {
      const host = reqHost || '127.0.0.1';
      const port = reqPort || 5900;

      logger.info(
        `VNC connect (manual) → ${host}:${port} [user: ${req.user?.sub || 'unknown'}]`
      );

      return res.json({
        wsUrl: '/vnc',
        protocol: 'vnc',
        host,
        port,
      });
    }

    // Auto-detect the active local VNC session
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

    logger.info(
      `VNC connect (auto) → ${host}:${port} [user: ${req.user?.sub || 'unknown'}]`
    );

    res.json({
      wsUrl: '/vnc',
      protocol: connection.provider?.protocol || 'vnc',
      host,
      port,
    });
  } catch (err) {
    logger.error('VNC connect error: ' + (err as Error).message);
    next(err);
  }
});

// ── POST /api/rdp/vnc/spawn ─────────────────────────────────────────
// Spawn a headless TigerVNC session.
// Body: { user: string, session: string, geometry?: string, depth?: number }
router.post('/vnc/spawn', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user, session, geometry, depth } = req.body;

    if (!user || !session) {
      return res.status(400).json({
        error: 'Both "user" and "session" are required.',
      });
    }

    logger.info(
      `VNC spawn requested: user=${user}, session=${session} [by: ${req.user?.sub || 'unknown'}]`
    );

    const spawned = await spawnSession({ user, session, geometry, depth });

    res.json({
      ...spawned,
      wsUrl: '/vnc',
      message: `Session started on display :${spawned.display} (port ${spawned.port})`,
    });
  } catch (err: any) {
    logger.error('VNC spawn error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/rdp/vnc/stop ──────────────────────────────────────────
// Stop a TuxPanel-managed VNC session.
// Body: { display: number }
router.post('/vnc/stop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { display } = req.body;

    if (display === undefined || display === null) {
      return res.status(400).json({ error: '"display" number is required.' });
    }

    logger.info(
      `VNC stop requested: display=:${display} [by: ${req.user?.sub || 'unknown'}]`
    );

    await stopSession(display);

    res.json({ message: `Session on display :${display} stopped.` });
  } catch (err: any) {
    logger.error('VNC stop error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/rdp/vnc/sessions ────────────────────────────────────────
// List all TuxPanel-managed headless VNC sessions.
router.get('/vnc/sessions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await listManagedSessions();
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════════════════
   RDP — Connect (via guacd)
   ══════════════════════════════════════════════════════════════════════ */

// ── POST /api/rdp/rdp/connect ────────────────────────────────────────
// Start an RDP→VNC bridge session using xfreerdp + Xvnc.
// Body: { host: string, port?: number, username?: string, password?: string, geometry?: string }
// Returns: { vncHost, vncPort, bridgeId } — frontend connects via noVNC to the local VNC port.
router.post('/rdp/connect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { host, port, username, password, geometry } = req.body || {};

    if (!host) {
      return res.status(400).json({ error: '"host" is required for RDP connections.' });
    }

    if (!username) {
      return res.status(400).json({ error: '"username" is required for RDP connections.' });
    }

    const rdpPort = port || 3389;

    logger.info(
      `RDP bridge requested → ${host}:${rdpPort} as '${username}' [by: ${req.user?.sub || 'unknown'}]`
    );

    const bridge = await startBridge({
      host,
      port: rdpPort,
      username,
      password: password || '',
      geometry: geometry || '1920x1080',
    });

    res.json({
      vncHost: bridge.vncHost,
      vncPort: bridge.vncPort,
      bridgeId: bridge.bridgeId,
      protocol: 'rdp',
      message: `RDP bridge active — VNC on port ${bridge.vncPort}`,
    });
  } catch (err: any) {
    logger.error('RDP connect error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/rdp/rdp/disconnect ─────────────────────────────────────
// Stop an RDP bridge session.
// Body: { bridgeId: string }
router.post('/rdp/disconnect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bridgeId } = req.body || {};
    if (!bridgeId) {
      return res.status(400).json({ error: '"bridgeId" is required.' });
    }
    cleanupBridge(bridgeId);
    res.json({ message: `Bridge ${bridgeId} stopped.` });
  } catch (err: any) {
    logger.error('RDP disconnect error: ' + err.message);
    next(err);
  }
});

// ── GET /api/rdp/rdp/bridges ─────────────────────────────────────────
// List active RDP bridge sessions.
router.get('/rdp/bridges', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ bridges: listBridges() });
  } catch (err) {
    next(err);
  }
});

export default router;
