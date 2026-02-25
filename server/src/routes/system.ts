/**
 * /api/system — System health & info endpoints (Phase 1)
 */

import { Router, Request, Response, NextFunction } from 'express';
import os from 'os';
import { run  } from '../utils/commandRunner';
import logger from '../utils/logger';

import fs from 'fs';

const router = Router();

// ── GET /api/system/overview ─────────────────────────────────────────
// Returns a combined snapshot of hostname, uptime, load, cpu, memory, disk.
router.get('/overview', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [hostnameRes, uptimeRes, loadavgRes, dfRes, lsblkRes] = await Promise.all([
      run('hostname'),
      run('uptime'),
      run('loadavg'),
      run('df'),
      run('lsblk'),
    ]);

    // CPU info from Node's os module (cross-check)
    const cpus = os.cpus();

    // Parse /proc/loadavg → "0.52 0.38 0.30 1/345 12345"
    const loadParts = loadavgRes.stdout.split(' ');

    res.json({
      hostname: hostnameRes.stdout,
      uptime: uptimeRes.stdout,
      load: {
        '1m': parseFloat(loadParts[0]),
        '5m': parseFloat(loadParts[1]),
        '15m': parseFloat(loadParts[2]),
      },
      cpu: {
        model: cpus[0]?.model,
        cores: cpus.length,
        usage: cpus.map((c) => {
          const total = Object.values(c.times).reduce((a, b) => a + b, 0);
          return +(((total - c.times.idle) / total) * 100).toFixed(1);
        }),
      },
      memory: {
        totalBytes: os.totalmem(),
        freeBytes: os.freemem(),
        usedBytes: os.totalmem() - os.freemem(),
        usedPercent: +(((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1),
      },
      disk: {
        raw: dfRes.stdout,
      },
      blockDevices: (() => {
        try {
          return JSON.parse(lsblkRes.stdout);
        } catch {
          return lsblkRes.stdout;
        }
      })(),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/system/memory ───────────────────────────────────────────
router.get('/memory', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('meminfo');
    const lines = result.stdout.split('\n');
    const info: any = {};
    for (const line of lines) {
      const match = line.match(/^(\w+):\s+(\d+)/);
      if (match) info[match[1]] = parseInt(match[2], 10) * 1024; // kB → bytes
    }
    res.json(info);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/system/network ──────────────────────────────────────────
router.get('/network', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('ipAddr');
    res.json(JSON.parse(result.stdout));
  } catch (err) {
    next(err);
  }
});

// ── GET /api/system/netstat ──────────────────────────────────────────
// Returns per-interface byte counters from /proc/net/dev for throughput calcs
router.get('/netstat', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = fs.readFileSync('/proc/net/dev', 'utf-8');
    const lines = raw.split('\n').slice(2); // skip headers
    const interfaces: Record<string, { rxBytes: number, txBytes: number }> = {};
    let totalRx = 0;
    let totalTx = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [name, rest] = trimmed.split(':');
      const iface = name.trim();
      if (iface === 'lo') continue; // skip loopback
      const parts = rest.trim().split(/\s+/).map(Number);
      // /proc/net/dev columns: rx_bytes rx_packets ... tx_bytes tx_packets ...
      const rxBytes = parts[0];
      const txBytes = parts[8];
      interfaces[iface] = { rxBytes, txBytes };
      totalRx += rxBytes;
      totalTx += txBytes;
    }

    res.json({ interfaces, totalRx, totalTx, timestamp: Date.now() });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/system/services ─────────────────────────────────────────
router.get('/services', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run('systemctlList');
    res.json({ raw: result.stdout });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/system/shutdown ─────────────────────────────────────────
router.post('/shutdown', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    logger.warn('System shutdown requested');
    res.json({ ok: true, message: 'Shutting down…' });
    // Small delay so the response reaches the client
    setTimeout(() => run('poweroff').catch((e) => logger.error(`poweroff failed: ${e.message}`)), 500);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/system/reboot ──────────────────────────────────────────
router.post('/reboot', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    logger.warn('System reboot requested');
    res.json({ ok: true, message: 'Rebooting…' });
    setTimeout(() => run('reboot').catch((e) => logger.error(`reboot failed: ${e.message}`)), 500);
  } catch (err) {
    next(err);
  }
});

export default router;
