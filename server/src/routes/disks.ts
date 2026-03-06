/**
 * /api/disks — Block devices, btrfs subvolumes/snapshots, mounts, shares
 */

import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { z } from 'zod';
import validate from '../middleware/validate';
import { run } from '../utils/commandRunner';
import logger from '../utils/logger';

const router = Router();

// ── GET /api/disks/block ─────────────────────────────────────────────
// Block devices + partition table via lsblk, filesystems via df
router.get('/block', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [lsblkRes, dfRes] = await Promise.all([run('lsblk'), run('df')]);

    let blockDevices = [];
    try {
      blockDevices = JSON.parse(lsblkRes.stdout).blockdevices || [];
    } catch { /* empty */ }

    const dfLines = dfRes.stdout.split('\n').slice(1);
    const filesystems = dfLines.filter((l) => l.trim()).map((line) => {
      const p = line.trim().split(/\s+/);
      return {
        source: p[0], fstype: p[1], size: p[2], used: p[3],
        avail: p[4], usePercent: p[5], mountpoint: p.slice(6).join(' '),
      };
    });

    res.json({ blockDevices, filesystems });
  } catch (err) { next(err); }
});

// ── GET /api/disks/subvolumes ────────────────────────────────────────
// Btrfs subvolumes for a given mountpoint (default /)
router.get('/subvolumes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mount = (req.query.mount as string) || '/';
    if (!/^\/[\w/.-]*$/.test(mount)) {
      return res.status(400).json({ error: 'Invalid mount path' });
    }

    const result = await run('btrfsSubvolList', [mount]);
    const subvolumes = result.stdout.split('\n').filter((l) => l.trim()).map((line) => {
      // Format: ID <id> gen <gen> top level <top> path <path>
      const m = line.match(/ID\s+(\d+)\s+gen\s+(\d+)\s+top level\s+(\d+)\s+path\s+(.+)/);
      if (!m) return null;
      return { id: parseInt(m[1]), gen: parseInt(m[2]), topLevel: parseInt(m[3]), path: m[4] };
    }).filter(Boolean);

    res.json({ subvolumes, mount });
  } catch (err: any) {
    if (err.stderr?.includes('not a btrfs filesystem') || err.message?.includes('not a btrfs')) {
      return res.json({ subvolumes: [], mount: req.query.mount || '/', error: 'Not a btrfs filesystem' });
    }
    next(err);
  }
});

const subvolSchema = z.object({
  path: z.string().regex(/^\/[\w/.-]+$/, 'Valid subvolume path required'),
});

// ── POST /api/disks/subvolumes ───────────────────────────────────────
// Create a btrfs subvolume
router.post('/subvolumes', validate(subvolSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { path: subvolPath } = req.body;
    logger.info(`Creating btrfs subvolume: ${subvolPath} [user: ${req.user?.sub || 'unknown'}]`);
    await run('btrfsSubvolCreateNew', [subvolPath]);
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// ── DELETE /api/disks/subvolumes ─────────────────────────────────────
// Delete a btrfs subvolume
router.delete('/subvolumes', validate(subvolSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { path: subvolPath } = req.body;
    logger.warn(`Deleting btrfs subvolume: ${subvolPath} [user: ${req.user?.sub || 'unknown'}]`);
    await run('btrfsSubvolDel', [subvolPath]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/disks/snapshots ─────────────────────────────────────────
// Btrfs snapshots for a given mountpoint (default /)
router.get('/snapshots', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mount = (req.query.mount as string) || '/';
    if (!/^\/[\w/.-]*$/.test(mount)) {
      return res.status(400).json({ error: 'Invalid mount path' });
    }

    const result = await run('btrfsSubvolSnap', [mount]);
    const snapshots = result.stdout.split('\n').filter((l) => l.trim()).map((line) => {
      // Format: ID <id> gen <gen> cgen <cgen> top level <top> otime <date> <time> path <path>
      const m = line.match(/ID\s+(\d+)\s+gen\s+(\d+)\s+cgen\s+(\d+)\s+top level\s+(\d+)\s+otime\s+(\S+\s+\S+)\s+path\s+(.+)/);
      if (!m) return null;
      return {
        id: parseInt(m[1]), gen: parseInt(m[2]), cgen: parseInt(m[3]),
        topLevel: parseInt(m[4]), otime: m[5], path: m[6],
      };
    }).filter(Boolean);

    res.json({ snapshots, mount });
  } catch (err: any) {
    if (err.stderr?.includes('not a btrfs filesystem') || err.message?.includes('not a btrfs')) {
      return res.json({ snapshots: [], mount: req.query.mount || '/', error: 'Not a btrfs filesystem' });
    }
    next(err);
  }
});

// ── DELETE /api/disks/snapshots ──────────────────────────────────────
// Delete a btrfs snapshot by its full path
router.delete('/snapshots', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { path: snapPath } = req.body;
    if (!snapPath || !/^\/[\w/.-]+$/.test(snapPath)) {
      return res.status(400).json({ error: 'Valid snapshot path required' });
    }
    logger.warn(`Deleting btrfs snapshot: ${snapPath} [user: ${req.user?.sub || 'unknown'}]`);
    await run('btrfsSubvolDel', [snapPath]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /api/disks/snapshots ────────────────────────────────────────
// Create a btrfs snapshot
router.post('/snapshots', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { source, destination, readonly } = req.body;
    if (!source || !destination) {
      return res.status(400).json({ error: 'source and destination are required' });
    }
    if (!/^\/[\w/.-]+$/.test(source) || !/^\/[\w/.-]+$/.test(destination)) {
      return res.status(400).json({ error: 'Invalid paths' });
    }
    const args = readonly ? ['-r', source, destination] : [source, destination];
    logger.info(`Creating btrfs snapshot: ${source} → ${destination} [user: ${req.user?.sub || 'unknown'}]`);
    await run('btrfsSubvolCreate', args);
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/disks/btrfs ────────────────────────────────────────────
// Btrfs filesystem overview
router.get('/btrfs', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('btrfsFsShow');
    res.json({ output: result.stdout });
  } catch (err) {
    res.json({ output: '', error: 'btrfs not available or no btrfs filesystems' });
  }
});

// ── GET /api/disks/mounts ────────────────────────────────────────────
// Active mounts via findmnt (JSON)
router.get('/mounts', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('findmnt');
    try {
      const parsed = JSON.parse(result.stdout);
      res.json(parsed);
    } catch {
      res.json({ filesystems: [], raw: result.stdout });
    }
  } catch (err) { next(err); }
});

// ── POST /api/disks/mounts ───────────────────────────────────────────
// Mount a device
router.post('/mounts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { device, mountpoint, fstype, options } = req.body;
    if (!device || !mountpoint) {
      return res.status(400).json({ error: 'device and mountpoint are required' });
    }
    const args = [];
    if (fstype) args.push('-t', fstype);
    if (options) args.push('-o', options);
    args.push(device, mountpoint);
    
    logger.info(`Mounting ${device} to ${mountpoint} [user: ${req.user?.sub || 'unknown'}]`);
    await run('mount', args);
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// ── DELETE /api/disks/mounts ─────────────────────────────────────────
// Unmount a device or mountpoint
router.delete('/mounts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { target } = req.body;
    if (!target) {
      return res.status(400).json({ error: 'target (device or mountpoint) is required' });
    }
    logger.warn(`Unmounting ${target} [user: ${req.user?.sub || 'unknown'}]`);
    await run('umount', [target]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/disks/shares ────────────────────────────────────────────
// Combined SMB + NFS share listing
router.get('/shares', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Samba shares
    let smbShares: any[] = [];
    try {
      const smbConf = '/etc/samba/smb.conf';
      if (fs.existsSync(smbConf)) {
        const content = fs.readFileSync(smbConf, 'utf-8');
        smbShares = parseSmbShares(content);
      }
    } catch { /* empty */ }

    // NFS exports
    let nfsExports: any[] = [];
    try {
      const exportsFile = '/etc/exports';
      if (fs.existsSync(exportsFile)) {
        const content = fs.readFileSync(exportsFile, 'utf-8');
        nfsExports = content.split('\n')
          .filter((l) => l.trim() && !l.trim().startsWith('#'))
          .map((line) => {
            const parts = line.trim().split(/\s+/);
            return { path: parts[0], clients: parts.slice(1).join(' '), type: 'nfs' };
          });
      }
    } catch { /* empty */ }

    // Service statuses
    let smbActive = false, nfsActive = false;
    try {
      const s = await run('systemctlStatus', ['smb.service']);
      smbActive = s.stdout.includes('active (running)');
    } catch { /* empty */ }
    try {
      const n = await run('systemctlStatus', ['nfs-server.service']);
      nfsActive = n.stdout.includes('active (running)');
    } catch { /* empty */ }

    res.json({ smbShares, nfsExports, smbActive, nfsActive });
  } catch (err) { next(err); }
});

// ── POST /api/disks/shares/smb ───────────────────────────────────────
router.post('/shares/smb', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, path, readOnly, guestOk } = req.body;
    if (!name || !path) return res.status(400).json({ error: 'name and path required' });
    
    const smbConf = '/etc/samba/smb.conf';
    let content = '';
    try {
      content = fs.readFileSync(smbConf, 'utf-8');
    } catch (err: any) {
      if (err.code === 'EACCES') {
        const r = await run('editConf', ['read', smbConf]);
        content = r.stdout;
      } else throw err;
    }
    
    if (content.includes(`[${name}]`)) {
      return res.status(400).json({ error: `Share [${name}] already exists` });
    }
    
    const block = `\n[${name}]\n\tpath = ${path}\n\tread only = ${readOnly ? 'yes' : 'no'}\n\tguest ok = ${guestOk ? 'yes' : 'no'}\n`;
    content += block;
    
    await run('editConf', ['write', smbConf], { stdin: content });
    await run('systemctlAction', ['reload', 'smb.service']).catch(() => {});
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// ── DELETE /api/disks/shares/smb ─────────────────────────────────────
router.delete('/shares/smb', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    
    const smbConf = '/etc/samba/smb.conf';
    let content = '';
    try {
      content = fs.readFileSync(smbConf, 'utf-8');
    } catch (err: any) {
      if (err.code === 'EACCES') {
        const r = await run('editConf', ['read', smbConf]);
        content = r.stdout;
      } else throw err;
    }
    
    const sections = content.split(/^\[/m);
    const newSections = sections.filter(s => {
      if (!s.trim()) return true;
      const match = s.match(/^([^\]]+)\]/);
      if (match && match[1].trim() === name) return false;
      return true;
    });
    
    content = newSections.map((s, i) => (i > 0 && s.trim() ? '[' + s : s)).join('');
    await run('editConf', ['write', smbConf], { stdin: content });
    await run('systemctlAction', ['reload', 'smb.service']).catch(() => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /api/disks/shares/nfs ───────────────────────────────────────
router.post('/shares/nfs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { path, clients } = req.body;
    if (!path || !clients) return res.status(400).json({ error: 'path and clients required' });
    
    const exportsFile = '/etc/exports';
    let content = '';
    try {
      content = fs.readFileSync(exportsFile, 'utf-8');
    } catch (err: any) {
      if (err.code === 'EACCES') {
        const r = await run('editConf', ['read', exportsFile]);
        content = r.stdout;
      } else if (err.code !== 'ENOENT') throw err;
    }
    
    const line = `${path} ${clients}\n`;
    content += (content.endsWith('\n') || !content ? '' : '\n') + line;
    
    await run('editConf', ['write', exportsFile], { stdin: content });
    await run('exportfs', ['-ra']).catch(() => {});
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// ── DELETE /api/disks/shares/nfs ─────────────────────────────────────
router.delete('/shares/nfs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { path } = req.body;
    if (!path) return res.status(400).json({ error: 'path required' });
    
    const exportsFile = '/etc/exports';
    let content = '';
    try {
      content = fs.readFileSync(exportsFile, 'utf-8');
    } catch (err: any) {
      if (err.code === 'EACCES') {
        const r = await run('editConf', ['read', exportsFile]);
        content = r.stdout;
      } else throw err;
    }
    
    const lines = content.split('\n');
    const newLines = lines.filter(l => !l.trim().startsWith(path + ' ') && l.trim() !== path);
    
    await run('editConf', ['write', exportsFile], { stdin: newLines.join('\n') });
    await run('exportfs', ['-ra']).catch(() => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

function parseSmbShares(content: string) {
  const shares = [];
  const sections = content.split(/^\[/m);
  for (const section of sections) {
    if (!section.trim()) continue;
    const nameMatch = section.match(/^([^\]]+)\]/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (['global', 'homes', 'printers', 'print$'].includes(name.toLowerCase())) continue;
    const props: any = {};
    for (const line of section.split('\n').slice(1)) {
      const m = line.match(/^\s+(\S[^=]*)=\s*(.*)/);
      if (m) props[m[1].trim().replace(/\s+/g, '_')] = m[2].trim();
    }
    shares.push({
      name, path: props.path || '', comment: props.comment || '',
      browseable: (props.browseable || props.browsable || 'yes').toLowerCase() === 'yes',
      readOnly: (props.read_only || 'yes').toLowerCase() === 'yes',
      guestOk: (props.guest_ok || 'no').toLowerCase() === 'yes',
      validUsers: props.valid_users || '', type: 'smb',
    });
  }
  return shares;
}

export default router;
