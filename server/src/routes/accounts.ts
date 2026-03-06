/**
 * /api/accounts — User account & security management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import validate from '../middleware/validate';
import { run  } from '../utils/commandRunner';
import logger from '../utils/logger';

const router = Router();

// ── Zod schemas ─────────────────────────────────────────────────────────
const unixName = z.string().regex(/^[a-z_][a-z0-9_-]*$/, 'Invalid name. Use lowercase letters, numbers, hyphens, underscores.');

const createUserSchema = z.object({
  username: unixName,
  shell: z.string().optional(),
  groups: z.string().optional(),
  createHome: z.boolean().optional().default(true),
});

const setPasswordSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

const groupMemberSchema = z.object({
  username: unixName,
});

// ── GET /api/accounts/users ──────────────────────────────────────────
// Returns local user accounts (UID >= 1000, excluding nfsnobody/nobody)
router.get('/users', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('userList');
    const lines = result.stdout.split('\n').filter((l) => l.trim());
    const users = [];

    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length < 7) continue;

      const uid = parseInt(parts[2], 10);
      const name = parts[0];

      // System users or special accounts
      if (uid < 1000 && uid !== 0) continue;
      if (['nobody', 'nfsnobody'].includes(name)) continue;

      users.push({
        username: name,
        uid,
        gid: parseInt(parts[3], 10),
        comment: parts[4],
        home: parts[5],
        shell: parts[6],
      });
    }

    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/accounts/groups ─────────────────────────────────────────
router.get('/groups', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('groupList');
    const lines = result.stdout.split('\n').filter((l) => l.trim());
    const groups = [];

    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length < 4) continue;

      const gid = parseInt(parts[2], 10);
      groups.push({
        name: parts[0],
        gid,
        members: parts[3] ? parts[3].split(',').filter(Boolean) : [],
      });
    }

    res.json({ groups });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/accounts/users ─────────────────────────────────────────
router.post('/users', validate(createUserSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, shell, groups, createHome } = req.body;

    const args = [];
    if (createHome !== false) args.push('-m');
    if (shell) args.push('-s', shell);
    if (groups) args.push('-G', groups);
    args.push(username);

    logger.info(`Creating user: ${username} [user: ${req.user?.sub || 'unknown'}]`);
    await run('useradd', args);
    res.status(201).json({ ok: true, username });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/accounts/users/:username/password ──────────────────────
router.post('/users/:username/password', validate(setPasswordSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username } = req.params;
    const { password } = req.body;

    if (!/^[a-z_][a-z0-9_-]*$/.test(username as string)) {
      return res.status(400).json({ error: 'Invalid username' });
    }

    logger.info(`Setting password for user: ${username} [user: ${req.user?.sub || 'unknown'}]`);
    await run('chpasswd', [], {
      stdin: `${username}:${password}`,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/accounts/users/:username ──────────────────────────────
router.delete('/users/:username', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username } = req.params;

    if (!/^[a-z_][a-z0-9_-]*$/.test(username as string)) {
      return res.status(400).json({ error: 'Invalid username' });
    }

    // Don't delete root or currently logged-in user
    if (username === 'root') {
      return res.status(403).json({ error: 'Cannot delete root account' });
    }

    logger.warn(`Deleting user: ${username}`);
    await run('userdel', ['-r', username as string]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/accounts/groups/:group/members ─────────────────────────
router.post('/groups/:group/members', validate(groupMemberSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { group } = req.params;
    const { username } = req.body;

    if (!/^[a-z_][a-z0-9_-]*$/.test(group as string)) {
      return res.status(400).json({ error: 'Invalid group name' });
    }

    logger.info(`Adding ${username} to group ${group} [user: ${req.user?.sub || 'unknown'}]`);
    await run('usermod', ['-aG', group as string, username as string]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/accounts/firewall ───────────────────────────────────────
// Get firewalld status and zones
router.get('/firewall', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [stateRes, zonesRes] = await Promise.all([
      run('firewalldState').catch(() => ({ stdout: 'not running' })),
      run('firewalldZones').catch(() => ({ stdout: '' })),
    ]);

    const running = stateRes.stdout.trim() === 'running';

    let zones: any[] = [];
    if (running) {
      try {
        const activeRes = await run('firewalldActiveZones');
        const defaultRes = await run('firewalldDefaultZone');
        zones = [{
          name: defaultRes.stdout.trim(),
          active: true,
          raw: activeRes.stdout,
        }];
      } catch {
        // ignore
      }
    }

    res.json({ running, zones });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/accounts/firewall/rules ─────────────────────────────────
router.get('/firewall/rules', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('firewalldListAll');
    res.json({ rules: result.stdout });
  } catch (err: any) {
    res.json({ rules: '', error: err.message });
  }
});

export default router;
