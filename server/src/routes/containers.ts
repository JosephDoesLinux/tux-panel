/**
 * /api/containers — Docker container management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { run  } from '../utils/commandRunner';
import logger from '../utils/logger';

const router = Router();

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
// Start, stop, restart, remove a container
router.post('/action', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, action } = req.body;

    if (!id || !action) {
      return res.status(400).json({ error: 'id and action are required' });
    }

    // Validate container ID (hex string or name)
    if (!/^[a-zA-Z0-9_.-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid container ID' });
    }

    const allowed = ['start', 'stop', 'restart', 'rm', 'pause', 'unpause'];
    if (!allowed.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Allowed: ${allowed.join(', ')}` });
    }

    logger.warn(`Container action: ${action} ${id}`);
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
// Pull an image
router.post('/pull', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'image is required' });
    }

    // Basic validation
    if (!/^[a-zA-Z0-9._/:-]+$/.test(image)) {
      return res.status(400).json({ error: 'Invalid image name' });
    }

    logger.info(`Pulling image: ${image}`);
    const result = await run('dockerPull', [image]);
    res.json({ ok: true, output: result.stdout });
  } catch (err) {
    next(err);
  }
});

export default router;
