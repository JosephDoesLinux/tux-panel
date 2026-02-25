/**
 * /api/diagnostics — Troubleshooting, logging, system info & reports
 */

const { Router } = require('express');
const fs = require('fs');
const { run } = require('../utils/commandRunner');
const logger = require('../utils/logger');

const router = Router();

/* ════════════════════════════════════════════════════════════════════
   SYSTEM INFO
   ════════════════════════════════════════════════════════════════════ */

// ── GET /api/diagnostics/sysinfo ─────────────────────────────────────
router.get('/sysinfo', async (_req, res, next) => {
  try {
    const results = {};

    // Run all info commands in parallel
    const [cpu, mem, host, uname, blk] = await Promise.allSettled([
      run('lscpu'),
      run('lsmem'),
      run('hostnamectl'),
      run('uname'),
      run('lsblk'),
    ]);

    results.cpu = cpu.status === 'fulfilled' ? cpu.value.stdout : null;
    results.memory = mem.status === 'fulfilled' ? mem.value.stdout : null;
    results.host = host.status === 'fulfilled' ? host.value.stdout : null;
    results.kernel = uname.status === 'fulfilled' ? uname.value.stdout : null;
    results.blockDevices = blk.status === 'fulfilled' ? blk.value.stdout : null;

    // PCI and USB — may not be installed
    const [pci, usb] = await Promise.allSettled([
      run('lspci'),
      run('lsusb'),
    ]);
    results.pci = pci.status === 'fulfilled' ? pci.value.stdout : null;
    results.usb = usb.status === 'fulfilled' ? usb.value.stdout : null;

    // /proc/cpuinfo for detailed per-core info
    try {
      results.cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    } catch { results.cpuinfo = null; }

    // /etc/os-release
    try {
      results.osRelease = fs.readFileSync('/etc/os-release', 'utf8');
    } catch { results.osRelease = null; }

    res.json(results);
  } catch (err) {
    next(err);
  }
});

/* ════════════════════════════════════════════════════════════════════
   LOGS
   ════════════════════════════════════════════════════════════════════ */

// ── GET /api/diagnostics/logs ────────────────────────────────────────
// Query params: lines, priority, unit, since, until, grep
router.get('/logs', async (req, res, next) => {
  try {
    const {
      lines = '200',
      priority,   // 0-7 (emerg..debug)
      unit,       // e.g. sshd
      since,      // e.g. "1 hour ago", "today", "2026-02-24"
      until,
      grep,
    } = req.query;

    const args = ['--no-pager', '-n', String(Math.min(parseInt(lines, 10) || 200, 2000))];

    if (priority && /^[0-7]$/.test(priority)) {
      args.push('-p', priority);
    }
    if (unit && /^[a-zA-Z0-9@._-]+$/.test(unit)) {
      args.push('-u', unit);
    }
    if (since && /^[a-zA-Z0-9 :\-]+$/.test(since)) {
      args.push('--since', since);
    }
    if (until && /^[a-zA-Z0-9 :\-]+$/.test(until)) {
      args.push('--until', until);
    }
    if (grep && grep.length <= 100) {
      args.push('-g', grep);
    }

    // Output as JSON for structured parsing
    args.push('-o', 'short-iso');

    const result = await run('journalctl', args, { timeout: 20_000 });
    res.json({ logs: result.stdout });
  } catch (err) {
    next(err);
  }
});

/* ════════════════════════════════════════════════════════════════════
   DIAGNOSTICS
   ════════════════════════════════════════════════════════════════════ */

// ── GET /api/diagnostics/dmesg ───────────────────────────────────────
router.get('/dmesg', async (req, res, next) => {
  try {
    const lines = Math.min(parseInt(req.query.lines, 10) || 200, 1000);
    // Try reading dmesg via journalctl (no sudo needed) first,
    // fall back to dmesg binary
    let output;
    try {
      const result = await run('journalctl', ['-k', '--no-pager', '-n', String(lines), '-o', 'short-iso'], { timeout: 10_000 });
      output = result.stdout;
    } catch {
      try {
        const result = await run('dmesg', ['--color=never'], { timeout: 10_000 });
        const allLines = result.stdout.split('\n');
        output = allLines.slice(-lines).join('\n');
      } catch (e2) {
        output = `Unable to read kernel log: ${e2.message}\n\nHint: You may need to run:\n  sudo sysctl kernel.dmesg_restrict=0\nor add the user to the 'adm' group.`;
      }
    }
    res.json({ dmesg: output, total: (output || '').split('\n').length });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/diagnostics/failed-units ────────────────────────────────
router.get('/failed-units', async (_req, res, next) => {
  try {
    const result = await run('failedUnits');
    res.json({ output: result.stdout });
  } catch (err) {
    // systemctl --failed exits non-zero when there are failures
    if (err.stdout) {
      return res.json({ output: err.stdout });
    }
    next(err);
  }
});

// ── GET /api/diagnostics/selinux ─────────────────────────────────────
router.get('/selinux', async (_req, res, next) => {
  try {
    const result = await run('ausearch', [], { timeout: 10_000 });
    res.json({ denials: result.stdout });
  } catch (err) {
    // ausearch returns 1 if no matches
    if (err.code === 1 || (err.stderr && err.stderr.includes('no matches'))) {
      return res.json({ denials: '', message: 'No SELinux denials found' });
    }
    // ausearch not installed or permission denied
    if (err.message.includes('ENOENT') || err.message.includes('Permission denied') || err.message.includes('operation not permitted')) {
      return res.json({ denials: null, message: 'audit tools not available (permission denied or not installed)' });
    }
    // Any other error — don't crash, just report it
    return res.json({ denials: null, message: err.message || 'Unable to query SELinux' });
  }
});

// ── GET /api/diagnostics/ports ───────────────────────────────────────
router.get('/ports', async (_req, res, next) => {
  try {
    const result = await run('ssListening');
    res.json({ output: result.stdout });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/diagnostics/smart/:device ───────────────────────────────
router.get('/smart/:device', async (req, res, next) => {
  try {
    const device = req.params.device;
    // Only allow sda, sdb, nvme0n1 etc.
    if (!/^[a-zA-Z0-9]+$/.test(device)) {
      return res.status(400).json({ error: 'Invalid device name' });
    }
    const result = await run('smartctl', ['-a', `/dev/${device}`]);
    res.json({ output: result.stdout });
  } catch (err) {
    if (err.stdout) {
      return res.json({ output: err.stdout });
    }
    next(err);
  }
});

// ── POST /api/diagnostics/ping ───────────────────────────────────────
router.post('/ping', async (req, res, next) => {
  try {
    const { host } = req.body;
    if (!host || !/^[a-zA-Z0-9._:-]+$/.test(host)) {
      return res.status(400).json({ error: 'Invalid host' });
    }
    logger.info(`Diagnostic ping: ${host}`);
    const result = await run('ping', [host], { timeout: 20_000 });
    res.json({ output: result.stdout });
  } catch (err) {
    if (err.stdout) return res.json({ output: err.stdout, error: err.stderr });
    next(err);
  }
});

// ── POST /api/diagnostics/traceroute ─────────────────────────────────
router.post('/traceroute', async (req, res, next) => {
  try {
    const { host } = req.body;
    if (!host || !/^[a-zA-Z0-9._:-]+$/.test(host)) {
      return res.status(400).json({ error: 'Invalid host' });
    }
    logger.info(`Diagnostic traceroute: ${host}`);
    const result = await run('traceroute', [host], { timeout: 45_000 });
    res.json({ output: result.stdout });
  } catch (err) {
    if (err.stdout) return res.json({ output: err.stdout, error: err.stderr });
    // traceroute not installed
    if (err.message.includes('ENOENT')) {
      return res.json({ output: null, error: 'traceroute not installed. sudo dnf install traceroute' });
    }
    next(err);
  }
});

// ── POST /api/diagnostics/dns ────────────────────────────────────────
router.post('/dns', async (req, res, next) => {
  try {
    const { host, type = 'A' } = req.body;
    if (!host || !/^[a-zA-Z0-9._:-]+$/.test(host)) {
      return res.status(400).json({ error: 'Invalid host' });
    }
    if (!/^[A-Z]+$/.test(type)) {
      return res.status(400).json({ error: 'Invalid record type' });
    }
    const result = await run('dig', [host, type]);
    res.json({ output: result.stdout });
  } catch (err) {
    if (err.message.includes('ENOENT')) {
      return res.json({ output: null, error: 'dig not installed. sudo dnf install bind-utils' });
    }
    next(err);
  }
});

/* ════════════════════════════════════════════════════════════════════
   REPORTS
   ════════════════════════════════════════════════════════════════════ */

// ── GET /api/diagnostics/report ──────────────────────────────────────
// Generates a full text system report
router.get('/report', async (_req, res, next) => {
  try {
    const sections = [];
    const divider = '═'.repeat(60);

    const ts = new Date().toISOString();
    sections.push(`TuxPanel System Report\nGenerated: ${ts}\n${divider}`);

    // Hostname + OS
    const [host, osRel, kern, up] = await Promise.allSettled([
      run('hostnamectl'),
      Promise.resolve({ stdout: fs.readFileSync('/etc/os-release', 'utf8') }),
      run('uname'),
      run('upSince'),
    ]);
    sections.push(`\n▌ HOST & OS\n${'─'.repeat(40)}`);
    if (host.status === 'fulfilled') sections.push(host.value.stdout);
    if (kern.status === 'fulfilled') sections.push(`Kernel: ${kern.value.stdout}`);
    if (up.status === 'fulfilled') sections.push(`Up since: ${up.value.stdout}`);

    // CPU
    const [cpu] = await Promise.allSettled([run('lscpu')]);
    sections.push(`\n▌ CPU\n${'─'.repeat(40)}`);
    if (cpu.status === 'fulfilled') sections.push(cpu.value.stdout);

    // Memory
    const [mem, meminfo] = await Promise.allSettled([
      run('lsmem'),
      run('free'),
    ]);
    sections.push(`\n▌ MEMORY\n${'─'.repeat(40)}`);
    if (mem.status === 'fulfilled') sections.push(mem.value.stdout);
    if (meminfo.status === 'fulfilled') sections.push(meminfo.value.stdout);

    // Disk
    const [diskDf, diskBlk] = await Promise.allSettled([
      run('df'),
      run('lsblk'),
    ]);
    sections.push(`\n▌ DISK\n${'─'.repeat(40)}`);
    if (diskDf.status === 'fulfilled') sections.push(diskDf.value.stdout);
    if (diskBlk.status === 'fulfilled') sections.push(`\n${diskBlk.value.stdout}`);

    // Network
    const [ip, ports] = await Promise.allSettled([
      run('ipAddr'),
      run('ssListening'),
    ]);
    sections.push(`\n▌ NETWORK\n${'─'.repeat(40)}`);
    if (ip.status === 'fulfilled') {
      try {
        const ifaces = JSON.parse(ip.value.stdout);
        for (const iface of ifaces) {
          const addrs = (iface.addr_info || []).map((a) => `${a.local}/${a.prefixlen}`).join(', ');
          sections.push(`  ${iface.ifname}: ${addrs || 'no address'} (${iface.operstate})`);
        }
      } catch {
        sections.push(ip.value.stdout);
      }
    }
    sections.push(`\n▌ LISTENING PORTS\n${'─'.repeat(40)}`);
    if (ports.status === 'fulfilled') sections.push(ports.value.stdout);

    // Services
    const [svcAll, svcFailed] = await Promise.allSettled([
      run('systemctlList'),
      run('failedUnits'),
    ]);
    sections.push(`\n▌ RUNNING SERVICES\n${'─'.repeat(40)}`);
    if (svcAll.status === 'fulfilled') sections.push(svcAll.value.stdout);
    sections.push(`\n▌ FAILED UNITS\n${'─'.repeat(40)}`);
    if (svcFailed.status === 'fulfilled') sections.push(svcFailed.value.stdout);
    else if (svcFailed.reason?.stdout) sections.push(svcFailed.reason.stdout);

    // PCI / USB
    const [pci, usb] = await Promise.allSettled([run('lspci'), run('lsusb')]);
    sections.push(`\n▌ PCI DEVICES\n${'─'.repeat(40)}`);
    if (pci.status === 'fulfilled') sections.push(pci.value.stdout);
    else sections.push('(lspci not available)');
    sections.push(`\n▌ USB DEVICES\n${'─'.repeat(40)}`);
    if (usb.status === 'fulfilled') sections.push(usb.value.stdout);
    else sections.push('(lsusb not available)');

    // Failed logins
    const [lastFail] = await Promise.allSettled([run('lastFailed')]);
    sections.push(`\n▌ RECENT FAILED LOGINS\n${'─'.repeat(40)}`);
    if (lastFail.status === 'fulfilled') sections.push(lastFail.value.stdout || '(none)');
    else sections.push('(data unavailable)');

    sections.push(`\n${divider}\nEnd of Report`);

    const report = sections.join('\n');
    logger.info('System report generated');
    res.json({ report, timestamp: ts });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
