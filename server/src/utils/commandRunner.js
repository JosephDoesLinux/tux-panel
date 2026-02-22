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

const { execFile } = require('child_process');
const { promisify } = require('util');
const logger = require('./logger');

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

  // ─── Phase 2: User & Share Management (stubs) ─────────────────
  userList:       { bin: '/usr/bin/getent',          defaultArgs: ['passwd'],               sudo: false },
  groupList:      { bin: '/usr/bin/getent',          defaultArgs: ['group'],                sudo: false },
  smbStatus:      { bin: '/usr/bin/smbstatus',       defaultArgs: ['--json'],               sudo: false },

  // ─── Phase 2: Samba config test ───────────────────────────────
  testparm:       { bin: '/usr/bin/testparm',        defaultArgs: ['-s', '--suppress-prompt'], sudo: false },

  // ─── Phase 3: Remote Desktop ──────────────────────────────────
  ssListening:    { bin: '/usr/bin/ss',               defaultArgs: ['-tlnp'],                  sudo: false },
  whichBin:       { bin: '/usr/bin/which',             defaultArgs: [],                         sudo: false },
};

/**
 * Run a registered command.
 *
 * @param {string}   name       Key from COMMAND_REGISTRY
 * @param {string[]} [extraArgs] Additional arguments appended after defaultArgs
 * @param {object}   [opts]     { timeout }
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
async function run(name, extraArgs = [], opts = {}) {
  const entry = COMMAND_REGISTRY[name];
  if (!entry) {
    throw new Error(`Command "${name}" is not in the allow-list.`);
  }

  // Sanitise: every arg must be a string, no embedded shell metacharacters
  const safeArgs = [...entry.defaultArgs, ...extraArgs].map(String);
  for (const arg of safeArgs) {
    if (/[;&|`$(){}]/.test(arg)) {
      throw new Error(`Illegal characters in argument: "${arg}"`);
    }
  }

  const bin = entry.sudo ? '/usr/bin/sudo' : entry.bin;
  const args = entry.sudo ? [entry.bin, ...safeArgs] : safeArgs;
  const timeout = opts.timeout || DEFAULT_TIMEOUT;

  logger.debug(`exec ▸ ${bin} ${args.join(' ')}`);

  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout,
      maxBuffer: 1024 * 1024,          // 1 MB
      env: { ...process.env, LC_ALL: 'C' }, // Consistent locale
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    logger.error(`exec ✗ ${name}: ${err.message}`);
    throw err;
  }
}

module.exports = { run, COMMAND_REGISTRY };
