/**
 * /api/health — lightweight liveness & readiness probe
 */

import { Router, Request, Response, NextFunction } from 'express';
import os from 'os';

const router = Router();

/** Return the first non-internal IPv4 address (or fallback). */
function primaryIP(): string {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    if (!iface) continue;
    for (const cfg of iface) {
      if (!cfg.internal && cfg.family === 'IPv4') return cfg.address;
    }
  }
  return '127.0.0.1';
}

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    ip: primaryIP(),
    platform: `${os.type()} ${os.release()}`,
    kernel: os.release(),
    nodeVersion: process.version,
    aiEnabled: !!process.env.GEMINI_API_KEY,
  });
});

export default router;
