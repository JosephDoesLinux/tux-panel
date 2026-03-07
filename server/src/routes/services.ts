/**
 * /api/services — Systemd service management, process listing, config file viewing
 */

import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { z } from 'zod';
import validate from '../middleware/validate';
import { run } from '../utils/commandRunner';
import { readPrivilegedFile, writePrivilegedFile } from '../utils/fileIO';
import logger from '../utils/logger';

const router = Router();

// ── Config file paths & service mappings ────────────────────────────
interface ConfigEntry {
  path: string;
  service: string;
  label: string;
  altPaths?: string[];
  validateCmd?: string;   // command registry key for syntax validation
}

const CONFIG_FILES: Record<string, ConfigEntry> = {
  ssh:  { path: '/etc/ssh/sshd_config',   service: 'sshd.service',      label: 'SSH',   validateCmd: 'sshdTest' },
  smb:  { path: '/etc/samba/smb.conf',     service: 'smb.service',       label: 'Samba', validateCmd: 'testparm' },
  nfs:  { path: '/etc/exports',            service: 'nfs-server.service', label: 'NFS' },
  ftp:  { path: '/etc/vsftpd/vsftpd.conf', service: 'vsftpd.service',   label: 'FTP',
          altPaths: ['/etc/vsftpd.conf'] },
};

// ── GET /api/services/units ──────────────────────────────────────────
// Returns all systemd service units (loaded)
router.get('/units', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('systemctlListAll');
    const lines = result.stdout.split('\n').filter((l) => l.trim());
    const units = [];

    for (const line of lines) {
      // Expected format: UNIT LOAD ACTIVE SUB DESCRIPTION...
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;
      // Skip the header line
      if (parts[0] === 'UNIT') continue;

      units.push({
        unit: parts[0],
        load: parts[1],
        active: parts[2],
        sub: parts[3],
        description: parts.slice(4).join(' '),
      });
    }

    res.json({ units });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/services/status/:unit ───────────────────────────────────
// Detailed status for a specific unit
router.get('/status/:unit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unit = req.params.unit;
    // Validate unit name
    if (!/^[a-zA-Z0-9@._:-]+$/.test(unit as string)) {
      return res.status(400).json({ error: 'Invalid unit name' });
    }

    const result = await run('systemctlStatus', [unit as string]);
    res.json({ unit, output: result.stdout });
  } catch (err: any) {
    // systemctl status returns non-zero for inactive services
    if (err.stdout) {
      return res.json({ unit: req.params.unit, output: err.stdout });
    }
    next(err);
  }
});

const actionSchema = z.object({
  unit: z.string().regex(/^[a-zA-Z0-9@._:-]+$/, 'Invalid unit name'),
  action: z.enum(['start', 'stop', 'restart', 'enable', 'disable', 'reload']),
});

// ── POST /api/services/action ────────────────────────────────────────
// Start, stop, restart, enable, disable a systemd unit
router.post('/action', validate(actionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { unit, action } = req.body;

    logger.warn(`Service action: ${action} ${unit} [user: ${req.user?.sub || 'unknown'}]`);
    const result = await run('systemctlAction', [action, unit]);
    res.json({ ok: true, output: result.stdout });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/services/journal/:unit ──────────────────────────────────
// Last N lines of journalctl for a unit
router.get('/journal/:unit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unit = req.params.unit;
    const lines = parseInt(req.query.lines as string, 10) || 50;

    if (!/^[a-zA-Z0-9@._:-]+$/.test(unit as string)) {
      return res.status(400).json({ error: 'Invalid unit name' });
    }

    const result = await run('journalctl', ['-u', unit as string, '-n', String(lines), '--no-pager']);
    res.json({ unit, lines: result.stdout });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/services/processes ──────────────────────────────────────
// Running processes via ps
router.get('/processes', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('ps');
    const lines = result.stdout.split('\n');
    const processes = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // ps aux format: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
      const parts = trimmed.split(/\s+/);
      if (parts.length < 11) continue;
      // Skip header line if present (in case --no-headers isn't honoured)
      if (parts[0] === 'USER' && parts[1] === 'PID') continue;

      processes.push({
        user: parts[0],
        pid: parseInt(parts[1], 10),
        cpu: parseFloat(parts[2]),
        mem: parseFloat(parts[3]),
        vsz: parseInt(parts[4], 10),
        rss: parseInt(parts[5], 10),
        tty: parts[6],
        stat: parts[7],
        start: parts[8],
        time: parts[9],
        command: parts.slice(10).join(' '),
      });
    }

    // Sort by CPU desc by default
    processes.sort((a, b) => b.cpu - a.cpu);

    res.json({ processes, total: processes.length });
  } catch (err) {
    next(err);
  }
});

const killSchema = z.object({
  pid: z.union([z.string(), z.number()]).transform(v => parseInt(String(v), 10)).refine(v => !isNaN(v), 'Valid PID is required'),
  signal: z.string().regex(/^[A-Z]+$/, 'Invalid signal').optional().default('TERM'),
});

// ── POST /api/services/kill ──────────────────────────────────────────
// Kill a process by PID
router.post('/kill', validate(killSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pid, signal } = req.body;

    logger.warn(`Killing process PID ${pid} with signal ${signal} [user: ${req.user?.sub || 'unknown'}]`);
    const result = await run('kill', [`-${signal}`, String(pid)]);
    res.json({ ok: true, output: result.stdout });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/services/config/:name ──────────────────────────────────
// Read a service config file (ssh, smb, nfs, ftp)
router.get('/config/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = (req.params.name as string).toLowerCase();
    const cfg = CONFIG_FILES[name];
    if (!cfg) {
      return res.status(400).json({ error: `Unknown config: ${name}. Valid: ${Object.keys(CONFIG_FILES).join(', ')}` });
    }

    // Try primary path, then alternatives
    let configPath = cfg.path;
    if (!fs.existsSync(configPath) && cfg.altPaths) {
      for (const alt of cfg.altPaths) {
        if (fs.existsSync(alt)) { configPath = alt; break; }
      }
    }

    const installed = fs.existsSync(configPath);
    let content = '';
    if (installed) {
      try {
        content = await readPrivilegedFile(configPath);
      } catch (e: any) {
        content = `# Unable to read ${configPath}: ${e.message}`;
      }
    }

    // Service status — single call, check for both active and enabled
    let serviceActive = false;
    let serviceEnabled = false;
    try {
      const st = await run('systemctlStatus', [cfg.service]);
      serviceActive = st.stdout.includes('active (running)');
      serviceEnabled = st.stdout.includes('enabled');
    } catch { /* not running / not enabled */ }

    res.json({
      name, label: cfg.label, path: configPath, installed,
      content, serviceActive, serviceEnabled, service: cfg.service,
    });
  } catch (err) { next(err); }
});

const configUpdateSchema = z.object({
  content: z.string({ message: 'content (string) is required' }),
  restart: z.boolean().optional(),
});

// ── PUT /api/services/config/:name ──────────────────────────────────
// Write a service config file and optionally restart the service
router.put('/config/:name', validate(configUpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = (req.params.name as string).toLowerCase();
    const cfg = CONFIG_FILES[name];
    if (!cfg) {
      return res.status(400).json({ error: `Unknown config: ${name}` });
    }

    const { content, restart } = req.body;

    // Resolve path
    let configPath = cfg.path;
    if (!fs.existsSync(configPath) && cfg.altPaths) {
      for (const alt of cfg.altPaths) {
        if (fs.existsSync(alt)) { configPath = alt; break; }
      }
    }

    // Write file
    const user = req.user?.sub || 'unknown';
    logger.warn(`[${user}] Writing config: ${configPath} (${content.length} bytes)`);
    await writePrivilegedFile(configPath, content);

    // Validate configuration syntax if a validation command exists
    let validated = true;
    let validationOutput = '';
    if (cfg.validateCmd) {
      try {
        const result = await run(cfg.validateCmd as any);
        validationOutput = result.stdout || result.stderr || '';
        logger.info(`Config validation passed for ${name}: ${validationOutput.slice(0, 200)}`);
      } catch (valErr: any) {
        validated = false;
        validationOutput = valErr.stderr || valErr.stdout || valErr.message || 'Validation failed';
        logger.warn(`Config validation FAILED for ${name}: ${validationOutput}`);

        // Attempt to restore from backup
        const backupPath = `${configPath}.bak`;
        try {
          const backupContent = await readPrivilegedFile(backupPath);
          await writePrivilegedFile(configPath, backupContent);
          logger.warn(`Restored ${configPath} from backup after failed validation`);
        } catch {
          logger.error(`Could not restore backup for ${configPath}`);
        }

        return res.status(422).json({
          ok: false,
          error: `Configuration syntax error — changes reverted`,
          validationOutput,
        });
      }
    }

    // Optionally restart the service
    if (restart) {
      try {
        await run('systemctlAction', ['restart', cfg.service]);
        logger.info(`Restarted ${cfg.service} after config update [user: ${req.user?.sub || 'unknown'}]`);
      } catch (e: any) {
        logger.warn(`Failed to restart ${cfg.service} [user: ${req.user?.sub || 'unknown'}]: ${e.message}`);
        return res.json({ ok: true, warning: `Config saved but service restart failed: ${e.message}` });
      }
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/services/config-list ───────────────────────────────────
// List available configs with their install/active status
router.get('/config-list', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const configs = [];
    for (const [name, cfg] of Object.entries(CONFIG_FILES)) {
      let installed = fs.existsSync(cfg.path);
      if (!installed && cfg.altPaths) {
        installed = cfg.altPaths.some((p) => fs.existsSync(p));
      }
      let serviceActive = false;
      try {
        const st = await run('systemctlStatus', [cfg.service]);
        serviceActive = st.stdout.includes('active (running)');
      } catch { /* empty */ }

      configs.push({ name, label: cfg.label, installed, serviceActive, service: cfg.service });
    }
    res.json({ configs });
  } catch (err) { next(err); }
});

export default router;
