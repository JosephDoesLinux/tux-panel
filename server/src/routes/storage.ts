/**
 * /api/storage — Disk, partition, and Samba/NFS share management
 */

import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { run  } from '../utils/commandRunner';
import logger from '../utils/logger';

const router = Router();

// ── GET /api/storage/disks ───────────────────────────────────────────
// Returns block devices + partition info (lsblk JSON) and df output.
router.get('/disks', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [lsblkRes, dfRes] = await Promise.all([
      run('lsblk'),
      run('df'),
    ]);

    let blockDevices = [];
    try {
      const parsed = JSON.parse(lsblkRes.stdout);
      blockDevices = parsed.blockdevices || [];
    } catch {
      blockDevices = [];
    }

    // Parse df output into structured data
    const dfLines = dfRes.stdout.split('\n').slice(1); // skip header
    const filesystems = dfLines
      .filter((l) => l.trim())
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        // df output: source fstype size used avail pcent target
        return {
          source: parts[0],
          fstype: parts[1],
          size: parts[2],
          used: parts[3],
          avail: parts[4],
          usePercent: parts[5],
          mountpoint: parts.slice(6).join(' '),
        };
      });

    res.json({ blockDevices, filesystems });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/storage/smart/:device ───────────────────────────────────
// SMART health for a device (requires smartmontools)
router.get('/smart/:device', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = (req.params.device as string).replace(/[^a-zA-Z0-9]/g, '');
    const result = await run('smartctl', ['-H', `-d`, 'auto', `/dev/${device}`]);
    res.json({ device, output: result.stdout });
  } catch (err: any) {
    // smartctl returns non-zero for many normal conditions
    if (err.stdout) {
      return res.json({ device: req.params.device, output: err.stdout });
    }
    next(err);
  }
});

// ── GET /api/storage/samba/shares ────────────────────────────────────
// Parse smb.conf and return share definitions
router.get('/samba/shares', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const smbConf = '/etc/samba/smb.conf';
    let shares: any[] = [];

    if (fs.existsSync(smbConf)) {
      const content = fs.readFileSync(smbConf, 'utf-8');
      shares = parseSmbConf(content);
    }

    // Try to get samba service status
    let serviceActive = false;
    try {
      const statusRes = await run('systemctlStatus', ['smb.service']);
      serviceActive = statusRes.stdout.includes('active (running)');
    } catch {
      serviceActive = false;
    }

    res.json({ shares, serviceActive });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/storage/samba/shares ───────────────────────────────────
// Add a new Samba share to smb.conf
router.post('/samba/shares', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, path: sharePath, comment, browseable, readOnly, validUsers, guestOk } = req.body;

    if (!name || !sharePath) {
      return res.status(400).json({ error: 'Name and path are required' });
    }

    // Validate share name (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return res.status(400).json({ error: 'Share name must be alphanumeric (hyphens/underscores allowed)' });
    }

    const smbConf = '/etc/samba/smb.conf';
    let content = '';
    if (fs.existsSync(smbConf)) {
      content = fs.readFileSync(smbConf, 'utf-8');
    }

    // Check if share already exists
    const existing = parseSmbConf(content);
    if (existing.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: `Share "${name}" already exists` });
    }

    // Build share block
    let block = `\n[${name}]\n`;
    block += `   path = ${sharePath}\n`;
    if (comment) block += `   comment = ${comment}\n`;
    block += `   browseable = ${browseable !== false ? 'yes' : 'no'}\n`;
    block += `   read only = ${readOnly !== false ? 'yes' : 'no'}\n`;
    if (guestOk) block += `   guest ok = yes\n`;
    if (validUsers) block += `   valid users = ${validUsers}\n`;
    block += `   create mask = 0664\n`;
    block += `   directory mask = 0775\n`;

    fs.appendFileSync(smbConf, block);

    // Test config
    try {
      await run('testparm');
    } catch (testErr: any) {
      logger.warn(`testparm warning after adding share: ${testErr.message}`);
    }

    // Reload samba
    try {
      await run('systemctlReload', ['smb.service']);
    } catch {
      // If reload fails, try restart
      try {
        await run('systemctlAction', ['restart', 'smb.service']);
      } catch (e: any) {
        logger.warn(`Failed to reload samba: ${e.message}`);
      }
    }

    logger.info(`Samba share added: [${name}] → ${sharePath}`);
    res.status(201).json({ ok: true, share: { name, path: sharePath, comment, browseable, readOnly, guestOk, validUsers } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/storage/samba/shares/:name ────────────────────────────
router.delete('/samba/shares/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shareName = req.params.name;
    const smbConf = '/etc/samba/smb.conf';

    if (!fs.existsSync(smbConf)) {
      return res.status(404).json({ error: 'smb.conf not found' });
    }

    let content = fs.readFileSync(smbConf, 'utf-8');
    const regex = new RegExp(`\\n?\\[${escapeRegex(shareName as string)}\\][^\\[]*`, 'i');
    const newContent = content.replace(regex, '');

    if (newContent === content) {
      return res.status(404).json({ error: `Share "${shareName}" not found` });
    }

    fs.writeFileSync(smbConf, newContent);

    // Reload samba
    try {
      await run('systemctlAction', ['reload', 'smb.service']);
    } catch {
      try {
        await run('systemctlAction', ['restart', 'smb.service']);
      } catch (e: any) {
        logger.warn(`Failed to reload samba: ${e.message}`);
      }
    }

    logger.info(`Samba share removed: [${shareName}]`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/storage/samba/status ────────────────────────────────────
// Active connections via smbstatus
router.get('/samba/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('smbStatus');
    try {
      res.json(JSON.parse(result.stdout));
    } catch {
      res.json({ raw: result.stdout });
    }
  } catch (err) {
    // smbstatus may fail if samba isn't running
    res.json({ error: 'Samba not running or smbstatus unavailable', sessions: [] });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────

function parseSmbConf(content: string) {
  const shares = [];
  const sections = content.split(/^\[/m);

  for (const section of sections) {
    if (!section.trim()) continue;
    const nameMatch = section.match(/^([^\]]+)\]/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    // Skip global/homes/printers
    if (['global', 'homes', 'printers', 'print$'].includes(name.toLowerCase())) continue;

    const props: any = {};
    const lines = section.split('\n').slice(1);
    for (const line of lines) {
      const match = line.match(/^\s+(\S[^=]*)=\s*(.*)/);
      if (match) {
        props[match[1].trim().replace(/\s+/g, '_')] = match[2].trim();
      }
    }

    shares.push({
      name,
      path: props.path || '',
      comment: props.comment || '',
      browseable: (props.browseable || props.browsable || 'yes').toLowerCase() === 'yes',
      readOnly: (props.read_only || 'yes').toLowerCase() === 'yes',
      guestOk: (props.guest_ok || 'no').toLowerCase() === 'yes',
      validUsers: props.valid_users || '',
    });
  }

  return shares;
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default router;
