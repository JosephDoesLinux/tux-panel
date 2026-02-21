/**
 * /api/system — System health & info endpoints (Phase 1)
 */

const { Router } = require('express');
const os = require('os');
const { run } = require('../utils/commandRunner');
const logger = require('../utils/logger');

const router = Router();

// ── GET /api/system/overview ─────────────────────────────────────────
// Returns a combined snapshot of hostname, uptime, load, cpu, memory, disk.
router.get('/overview', async (_req, res, next) => {
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
router.get('/memory', async (_req, res, next) => {
  try {
    const result = await run('meminfo');
    const lines = result.stdout.split('\n');
    const info = {};
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
router.get('/network', async (_req, res, next) => {
  try {
    const result = await run('ipAddr');
    res.json(JSON.parse(result.stdout));
  } catch (err) {
    next(err);
  }
});

// ── GET /api/system/services ─────────────────────────────────────────
router.get('/services', async (_req, res, next) => {
  try {
    const result = await run('systemctlList');
    res.json({ raw: result.stdout });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
