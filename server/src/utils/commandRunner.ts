/**
 * Safe Command Execution Wrapper
 *
 * ALL system commands go through this module. It provides:
 *   1. An allow-list of permitted commands.
 *   2. Argument sanitisation (no shell injection).
 *   3. Timeout enforcement.
 *   4. Structured logging of every invocation.
 *
 * Philosophy: The Node process should NEVER call arbitrary shell strings.
 *             Every command must be registered here first.
 */

import { execFile, spawn } from 'child_process';
import { promisify  } from 'util';
import logger from './logger';
import asyncLocalStorage from './asyncContext';

const execFileAsync = promisify(execFile);

// ── Maximum execution time (ms) ──────────────────────────────────────
const DEFAULT_TIMEOUT = 15_000;

// ── Allow-listed commands ────────────────────────────────────────────
// Maps a friendly name → { bin, defaultArgs, sudo }
// Only commands in this map can be run.
const COMMAND_REGISTRY = {
  // ─── Phase 1: System Health ────────────────────────────────────
  hostname:       { bin: '/usr/bin/hostname',     defaultArgs: [],                         sudo: false },
  uptime:         { bin: '/usr/bin/uptime',        defaultArgs: ['-p'],                    sudo: false },
  uname:          { bin: '/usr/bin/uname',         defaultArgs: ['-a'],                    sudo: false },
  free:           { bin: '/usr/bin/free',           defaultArgs: ['-b'],                   sudo: false },
  df:             { bin: '/usr/bin/df',             defaultArgs: ['-BK', '--output=source,fstype,size,used,avail,pcent,target'], sudo: false },
  lsblk:          { bin: '/usr/bin/lsblk',          defaultArgs: ['-Jb'],                  sudo: false },
  cpuTemp:        { bin: '/usr/bin/cat',            defaultArgs: ['/sys/class/thermal/thermal_zone0/temp'], sudo: false },
  loadavg:        { bin: '/usr/bin/cat',            defaultArgs: ['/proc/loadavg'],         sudo: false },
  meminfo:        { bin: '/usr/bin/cat',            defaultArgs: ['/proc/meminfo'],         sudo: false },

  // ─── Network ──────────────────────────────────────────────────
  ipAddr:         { bin: '/usr/sbin/ip',            defaultArgs: ['-j', 'addr'],           sudo: false },

  // ─── Systemd ──────────────────────────────────────────────────
  systemctlStatus:{ bin: '/usr/bin/systemctl',      defaultArgs: ['status'],               sudo: false },
  systemctlList:  { bin: '/usr/bin/systemctl',      defaultArgs: ['list-units', '--type=service', '--state=running', '--no-pager', '--plain'], sudo: false },
  systemctlListAll: { bin: '/usr/bin/systemctl',    defaultArgs: ['list-units', '--type=service', '--all', '--no-pager', '--plain'], sudo: false },
  systemctlAction:{ bin: '/usr/bin/systemctl',      defaultArgs: [],                       sudo: true },
  systemctlReload:{ bin: '/usr/bin/systemctl',      defaultArgs: ['reload'],               sudo: true },

  // ─── Journald ─────────────────────────────────────────────────
  journalctl:     { bin: '/usr/bin/journalctl',     defaultArgs: [], sudo: true },

  // ─── Process Management ───────────────────────────────────────
  ps:             { bin: '/usr/bin/ps',              defaultArgs: ['aux', '--no-headers'],  sudo: false },
  kill:           { bin: '/usr/bin/kill',            defaultArgs: [],                       sudo: true },

  // ─── User & Group Management ──────────────────────────────────
  userList:       { bin: '/usr/bin/getent',          defaultArgs: ['passwd'],               sudo: false },
  groupList:      { bin: '/usr/bin/getent',          defaultArgs: ['group'],                sudo: false },
  useradd:        { bin: '/usr/bin/useradd',         defaultArgs: [],                      sudo: true },
  userdel:        { bin: '/usr/bin/userdel',         defaultArgs: [],                      sudo: true },
  usermod:        { bin: '/usr/bin/usermod',         defaultArgs: [],                      sudo: true },
  chpasswd:       { bin: '/usr/bin/chpasswd',        defaultArgs: [],                     sudo: true },

  // ─── Samba ────────────────────────────────────────────────────
  smbStatus:      { bin: '/usr/bin/smbstatus',       defaultArgs: ['--json'],               sudo: false },
  testparm:       { bin: '/usr/bin/testparm',        defaultArgs: ['-s', '--suppress-prompt'], sudo: false },

  // ─── Config Validation ────────────────────────────────────────
  sshdTest:       { bin: '/usr/sbin/sshd',           defaultArgs: ['-t'],                   sudo: true },
  vsftpdTest:     { bin: '/usr/sbin/vsftpd',         defaultArgs: ['-olisten=NO'],           sudo: false },

  // ─── SMART Monitoring ─────────────────────────────────────────
  smartctl:       { bin: '/usr/bin/smartctl',        defaultArgs: [],                      sudo: true },

  // ─── Disk / Btrfs ─────────────────────────────────────────────
  btrfsSubvolList:{ bin: '/usr/bin/btrfs',           defaultArgs: ['subvolume', 'list'],     sudo: true },
  btrfsSubvolSnap:{ bin: '/usr/bin/btrfs',           defaultArgs: ['subvolume', 'list', '-s'], sudo: true },
  btrfsFsShow:    { bin: '/usr/bin/btrfs',           defaultArgs: ['filesystem', 'show'],    sudo: true },
  btrfsFsUsage:   { bin: '/usr/bin/btrfs',           defaultArgs: ['filesystem', 'usage'],   sudo: true },
  btrfsSubvolDel: { bin: '/usr/bin/btrfs',           defaultArgs: ['subvolume', 'delete'],   sudo: true },
  btrfsSubvolCreate: { bin: '/usr/bin/btrfs',        defaultArgs: ['subvolume', 'snapshot'], sudo: true },
  btrfsSubvolCreateNew: { bin: '/usr/bin/btrfs',     defaultArgs: ['subvolume', 'create'],   sudo: true },
  findmnt:        { bin: '/usr/bin/findmnt',         defaultArgs: ['-J'],                   sudo: false },
  exportfs:       { bin: '/usr/bin/exportfs',        defaultArgs: ['-v'],                   sudo: false },
  mount:          { bin: '/usr/bin/mount',           defaultArgs: [],                       sudo: true },
  umount:         { bin: '/usr/bin/umount',          defaultArgs: [],                       sudo: true },
  editConf:       { bin: '/opt/tuxpanel/scripts/tuxpanel-edit-conf.sh', defaultArgs: [],    sudo: true },

  // ─── Docker Container Management ──────────────────────────────
  dockerPs:       { bin: '/usr/bin/docker',          defaultArgs: ['ps', '-a', '--format', 'json'], sudo: true },
  dockerImages:   { bin: '/usr/bin/docker',          defaultArgs: ['images', '--format', 'json'], sudo: true },
  dockerAction:   { bin: '/usr/bin/docker',          defaultArgs: [], sudo: true },
  dockerLogs:     { bin: '/usr/bin/docker',          defaultArgs: ['logs'], sudo: true },
  dockerStats:    { bin: '/usr/bin/docker',          defaultArgs: ['stats', '--no-stream', '--format', 'json'], sudo: true },
  dockerPull:     { bin: '/usr/bin/docker',          defaultArgs: ['pull'], sudo: true },
  dockerInspect:  { bin: '/usr/bin/docker',          defaultArgs: ['inspect'], sudo: true },

  // ─── Firewall ─────────────────────────────────────────────────
  firewalldState:      { bin: '/usr/bin/firewall-cmd', defaultArgs: ['--state'],              sudo: false },
  firewalldZones:      { bin: '/usr/bin/firewall-cmd', defaultArgs: ['--get-zones'],          sudo: false },
  firewalldActiveZones:{ bin: '/usr/bin/firewall-cmd', defaultArgs: ['--get-active-zones'],   sudo: false },
  firewalldDefaultZone:{ bin: '/usr/bin/firewall-cmd', defaultArgs: ['--get-default-zone'],   sudo: false },
  firewalldListAll:    { bin: '/usr/bin/firewall-cmd', defaultArgs: ['--list-all'],           sudo: false },

  // ─── Diagnostics / Troubleshooting ─────────────────────────────
  lscpu:          { bin: '/usr/bin/lscpu',              defaultArgs: [],                         sudo: false },
  lsmem:          { bin: '/usr/bin/lsmem',              defaultArgs: ['--summary'],               sudo: false },
  hostnamectl:    { bin: '/usr/bin/hostnamectl',        defaultArgs: [],                         sudo: false },
  lspci:          { bin: '/usr/sbin/lspci',             defaultArgs: [],                         sudo: false },
  lsusb:          { bin: '/usr/bin/lsusb',              defaultArgs: [],                         sudo: false },
  dmesg:          { bin: '/usr/bin/dmesg',              defaultArgs: ['--time-format', 'reltime', '--nopager'], sudo: true },
  failedUnits:    { bin: '/usr/bin/systemctl',          defaultArgs: ['--failed', '--no-pager', '--plain'], sudo: false },
  ausearch:       { bin: '/usr/sbin/ausearch',          defaultArgs: ['-m', 'AVC', '--raw'],     sudo: true },
  ping:           { bin: '/usr/bin/ping',               defaultArgs: ['-c', '4', '-W', '3'],     sudo: false },
  traceroute:     { bin: '/usr/bin/traceroute',         defaultArgs: ['-m', '15', '-w', '2'],    sudo: false },
  dig:            { bin: '/usr/bin/dig',                defaultArgs: ['+short'],                 sudo: false },
  lastFailed:     { bin: '/usr/bin/lastb',              defaultArgs: ['-n', '25'],               sudo: true },
  upSince:        { bin: '/usr/bin/uptime',             defaultArgs: ['-s'],                     sudo: false },

  // ─── Remote Desktop ──────────────────────────────────────────
  ssListening:    { bin: '/usr/bin/ss',               defaultArgs: ['-tlnp'], sudo: true },
  whichBin:       { bin: '/usr/bin/which',             defaultArgs: [],                         sudo: false },
  x11vnc:         { bin: '/usr/bin/x11vnc',          defaultArgs: [],                         sudo: true },

  // ─── Power Management ─────────────────────────────────────────
  poweroff:       { bin: '/usr/bin/systemctl',         defaultArgs: ['poweroff'],               sudo: true },
  reboot:         { bin: '/usr/bin/systemctl',         defaultArgs: ['reboot'],                 sudo: true },
};

/**
 * Run a registered command.
 *
 * @param {string}   name       Key from COMMAND_REGISTRY
 * @param {string[]} [extraArgs] Additional arguments appended after defaultArgs
 * @param {object}   [opts]     { timeout, stdin }
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
async function run(name: keyof typeof COMMAND_REGISTRY, extraArgs: string[] = [], opts: { timeout?: number, stdin?: string } = {}): Promise<{ stdout: string, stderr: string }> {
  const entry = COMMAND_REGISTRY[name];
  if (!entry) {
    throw new Error(`Command "${name}" is not in the allow-list.`);
  }

  // Sanitise: every arg must be a string
  const safeArgs = [...entry.defaultArgs, ...extraArgs].map(String);

  // Privileged commands are elevated via pkexec using our strict wrapper
  // The installer places this in /opt/tuxpanel/scripts and sets it strictly to root:root.
  // Polkit relies on this absolute path. Using local dev paths would trigger a GUI password prompt.
  let wrapperPath = '/opt/tuxpanel/scripts/tuxpanel-priv-wrapper.sh';
  
  // In development, if the system-wide strict wrapper hasn't been installed yet, gracefully fallback
  // so the application doesn't completely crash (though it WILL trigger a GUI password prompt).
  if (process.env.NODE_ENV !== 'production' && !require('fs').existsSync(wrapperPath)) {
    wrapperPath = require('path').resolve(__dirname, '../../scripts/tuxpanel-priv-wrapper.sh');
  }
  
  let targetBin = entry.bin;
  if (process.env.NODE_ENV !== 'production' && targetBin === '/opt/tuxpanel/scripts/tuxpanel-edit-conf.sh') {
    if (!require('fs').existsSync(targetBin)) {
      targetBin = require('path').resolve(__dirname, '../../scripts/tuxpanel-edit-conf.sh');
    }
  }

  let bin = entry.sudo ? '/usr/bin/pkexec' : targetBin;
  let args = entry.sudo ? [
    wrapperPath,
    targetBin,
    ...safeArgs
  ] : safeArgs;

  // In development, if using the fallback wrapper, pkexec will trigger a host GUI password prompt
  // which freezes remote headless developers. Fallback to sudo -n to fail fast instead.
  if (entry.sudo && process.env.NODE_ENV !== 'production' && wrapperPath !== '/opt/tuxpanel/scripts/tuxpanel-priv-wrapper.sh') {
    bin = '/usr/bin/sudo';
    args = ['-n', wrapperPath, targetBin, ...safeArgs];
  }
  const timeout = opts.timeout || DEFAULT_TIMEOUT;

  logger.debug(`exec ▸ ${bin} ${args.join(' ')}`);

  const env = { ...process.env, LC_ALL: 'C' };

  try {
    if (opts.stdin !== undefined) {
      return await new Promise((resolve, reject) => {
        const child = spawn(bin, args, {
          timeout,
          env,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => stdout += d);
        child.stderr.on('data', (d) => stderr += d);
        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
          else reject(new Error(`Command failed with code ${code}: ${stderr}`));
        });
        
        if (child.stdin) {
          child.stdin.write(opts.stdin);
          child.stdin.end();
        }
      });
    } else {
      const { stdout, stderr } = await execFileAsync(bin, args, {
        timeout,
        maxBuffer: 1024 * 1024,          // 1 MB
        env,
      });
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    }
  } catch (err: any) {
    // whichBin failures are expected (binary not installed) — log at debug
    if (name === 'whichBin') {
      logger.debug(`exec ✗ ${name}: ${err.message}`);
    } else {
      logger.error(`exec ✗ ${name}: ${err.message}`);
    }
    throw err;
  }
}

export {  run, COMMAND_REGISTRY  };
