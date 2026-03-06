/**
 * /api/containers — Docker container management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import validate from '../middleware/validate';
import { run  } from '../utils/commandRunner';
import logger from '../utils/logger';

const router = Router();

// ── Zod schemas ─────────────────────────────────────────────────────────
const containerActionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid container ID'),
  action: z.enum(['start', 'stop', 'restart', 'rm', 'pause', 'unpause']),
});

const pullImageSchema = z.object({
  image: z.string().regex(/^[a-zA-Z0-9._/:-]+$/, 'Invalid image name'),
});

// ── GET /api/containers/list ─────────────────────────────────────────
// Returns all containers (running + stopped)
router.get('/list', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('dockerPs');
    try {
      const containers = JSON.parse(result.stdout);
      res.json({ containers });
    } catch {
      res.json({ containers: [], raw: result.stdout });
    }
  } catch (err: any) {
    // Docker may not be installed
    if (err.message.includes('not in the allow-list') || err.message.includes('ENOENT')) {
      return res.json({ containers: [], error: 'Docker not available' });
    }
    next(err);
  }
});

// ── GET /api/containers/images ───────────────────────────────────────
router.get('/images', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('dockerImages');
    try {
      const images = JSON.parse(result.stdout);
      res.json({ images });
    } catch {
      res.json({ images: [], raw: result.stdout });
    }
  } catch (err: any) {
    if (err.message.includes('not in the allow-list') || err.message.includes('ENOENT')) {
      return res.json({ images: [], error: 'Docker not available' });
    }
    next(err);
  }
});

// ── POST /api/containers/action ──────────────────────────────────────
router.post('/action', validate(containerActionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, action } = req.body;

    logger.warn(`Container action: ${action} ${id} [user: ${req.user?.sub || 'unknown'}]`);
    const result = await run('dockerAction', [action, id]);
    res.json({ ok: true, output: result.stdout });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/containers/logs/:id ─────────────────────────────────────
router.get('/logs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    if (!/^[a-zA-Z0-9_.-]+$/.test(id as string)) {
      return res.status(400).json({ error: 'Invalid container ID' });
    }

    const lines = parseInt(req.query.lines as string, 10) || 100;
    const result = await run('dockerLogs', ['--tail', String(lines), id as string]);
    res.json({ id, logs: result.stdout });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/containers/stats ────────────────────────────────────────
// Resource usage for running containers
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('dockerStats');
    try {
      const stats = JSON.parse(result.stdout);
      res.json({ stats });
    } catch {
      res.json({ stats: [], raw: result.stdout });
    }
  } catch (err: any) {
    if (err.message.includes('not in the allow-list') || err.message.includes('ENOENT')) {
      return res.json({ stats: [], error: 'Docker not available' });
    }
    next(err);
  }
});

// ── POST /api/containers/pull ────────────────────────────────────────
router.post('/pull', validate(pullImageSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { image } = req.body;

    logger.info(`Pulling image: ${image} [user: ${req.user?.sub || 'unknown'}]`);
    const result = await run('dockerPull', [image]);
    res.json({ ok: true, output: result.stdout });
  } catch (err) {
    next(err);
  }
});

export default router;
