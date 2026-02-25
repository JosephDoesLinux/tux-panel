/**
 * /api/health — lightweight liveness & readiness probe
 */

import { Router, Request, Response, NextFunction } from 'express';
import os from 'os';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    nodeVersion: process.version,
  });
});

export default router;
