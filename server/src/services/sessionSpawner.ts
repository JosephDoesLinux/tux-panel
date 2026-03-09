/**
 * VNC Session Spawner — starts headless TigerVNC sessions for
 * specific system users with a chosen desktop environment.
 *
 * Uses the systemd template unit `vncserver@.service` (provided by
 * TigerVNC) which reads user→display mappings from /etc/tigervnc/vncserver.users.
 *
 * Flow:
 *   1. Write `:N=username` into /etc/tigervnc/vncserver.users
 *   2. Ensure ~/.vnc/config has the correct `session=<de>` line
 *   3. Start `vncserver@:N.service` via systemctl
 *   4. Return the port (5900 + N) for the frontend to connect
 *
 * Cleanup:
 *   - Stop the systemd unit
 *   - Remove the mapping from vncserver.users
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { run } from '../utils/commandRunner';
import logger from '../utils/logger';

/* ══════════════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════════════ */

export interface SpawnedSession {
  display: number;
  port: number;
  user: string;
  session: string;
  status: 'starting' | 'running' | 'failed';
  pid?: number;
  startedAt: string;
}

export interface SpawnRequest {
  user: string;
  session: string;       // Desktop session ID ("plasma", "gnome", etc.)
  geometry?: string;     // e.g. "1920x1080"
  depth?: number;        // Color depth (16, 24, 32)
}

/* ══════════════════════════════════════════════════════════════════════
   Globals — track sessions we've spawned in this process lifetime
   ══════════════════════════════════════════════════════════════════════ */

const VNCSERVER_USERS_FILE = '/etc/tigervnc/vncserver.users';
const MANAGED_SESSIONS: Map<number, SpawnedSession> = new Map();

// Displays 10–49 are reserved for TuxPanel-managed headless sessions
const DISPLAY_MIN = 10;
const DISPLAY_MAX = 49;

/* ══════════════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Read the current /etc/tigervnc/vncserver.users and return a
 * map of display → username.
 */
async function readUserMappings(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  let raw = '';
  try {
    // Fast path: direct read (works if file is world-readable)
    raw = await readFile(VNCSERVER_USERS_FILE, 'utf-8');
  } catch {
    // Fallback: elevated read via pkexec
    try {
      const { stdout } = await run('editConf', ['read', VNCSERVER_USERS_FILE]);
      raw = stdout;
    } catch {
      return map; // File doesn't exist yet
    }
  }

  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^:(\d+)=(\S+)$/);
    if (m) {
      map.set(parseInt(m[1], 10), m[2]);
    }
  }
  return map;
}

/**
 * Find the next free display number in our managed range.
 */
async function findFreeDisplay(): Promise<number> {
  const existing = await readUserMappings();

  for (let d = DISPLAY_MIN; d <= DISPLAY_MAX; d++) {
    if (!existing.has(d)) return d;
  }

  throw new Error('No free VNC display numbers available (range 10–49 exhausted)');
}

/**
 * Add a line to /etc/tigervnc/vncserver.users.
 * Requires elevated privileges (pkexec via commandRunner).
 */
async function addUserMapping(display: number, username: string): Promise<void> {
  let content = '';
  try {
    content = await readFile(VNCSERVER_USERS_FILE, 'utf-8');
  } catch {
    // Direct read failed — try elevated read
    try {
      const { stdout } = await run('editConf', ['read', VNCSERVER_USERS_FILE]);
      content = stdout;
    } catch {
      // File doesn't exist yet
    }
  }

  // Ensure trailing newline
  if (content.length > 0 && !content.endsWith('\n')) {
    content += '\n';
  }

  content += `:${display}=${username}\n`;

  // Write via pkexec (editConf)
  await run('editConf', ['write', VNCSERVER_USERS_FILE], { stdin: content });
  logger.info(`Added VNC user mapping :${display}=${username}`);
}

/**
 * Remove a display mapping from /etc/tigervnc/vncserver.users.
 */
async function removeUserMapping(display: number): Promise<void> {
  let content = '';
  try {
    content = await readFile(VNCSERVER_USERS_FILE, 'utf-8');
  } catch {
    try {
      const { stdout } = await run('editConf', ['read', VNCSERVER_USERS_FILE]);
      content = stdout;
    } catch {
      return; // Nothing to remove
    }
  }

  const filtered = content
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.match(new RegExp(`^:${display}=`));
    })
    .join('\n');

  await run('editConf', ['write', VNCSERVER_USERS_FILE], { stdin: filtered });
  logger.info(`Removed VNC user mapping for display :${display}`);
}

/**
 * Ensure the user's ~/.vnc/config file has the right session.
 * Creates the directory if needed.
 */
async function ensureUserVncConfig(
  user: string,
  home: string,
  session: string,
  geometry: string,
  depth: number
): Promise<void> {
  const configPath = path.join(home, '.vnc', 'config');

  // tuxpanel-edit-conf.sh auto-creates parent dirs (~/.vnc/) and
  // fixes ownership for /home/* paths — no manual mkdir needed.
  //
  // localhost     → bind to 127.0.0.1 only (the WS proxy handles external access)
  // securitytypes=none → no VNC password required (already authenticated via WS)
  const configContent = [
    `# Generated by TuxPanel`,
    `session=${session}`,
    `geometry=${geometry}`,
    `depth=${depth}`,
    `localhost`,
    `securitytypes=none`,
    `alwaysshared`,
    '',
  ].join('\n');

  await run('editConf', ['write', configPath], { stdin: configContent });
  logger.info(`VNC config written for ${user} at ${configPath}: session=${session}`);
}

/* ══════════════════════════════════════════════════════════════════════
   Spawn / Stop
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Spawn a new headless VNC session for the given user + desktop environment.
 */
export async function spawnSession(req: SpawnRequest): Promise<SpawnedSession> {
  const { user, session } = req;
  const geometry = req.geometry || '1920x1080';
  const depth = req.depth || 24;

  logger.info(`Spawning VNC session: user=${user}, session=${session}, geometry=${geometry}`);

  // 1. Get user info to find their home dir
  const { stdout: passwdLine } = await run('userList', []);
  const userLine = passwdLine
    .split('\n')
    .find((l) => l.startsWith(`${user}:`));

  if (!userLine) {
    throw new Error(`User '${user}' not found in /etc/passwd`);
  }

  const parts = userLine.split(':');
  const home = parts[5];

  // 2. Find a free display
  const display = await findFreeDisplay();
  const port = 5900 + display;

  // 3. Add user→display mapping
  await addUserMapping(display, user);

  // 4. Write user VNC config with session
  await ensureUserVncConfig(user, home, session, geometry, depth);

  // 5. Start the systemd VNC unit
  try {
    await run('systemctlAction', ['start', `vncserver@:${display}.service`], { timeout: 15000 });
  } catch (err: any) {
    // Cleanup the mapping on failure
    await removeUserMapping(display).catch(() => {});
    throw new Error(`Failed to start VNC session: ${err.message}`);
  }

  const spawned: SpawnedSession = {
    display,
    port,
    user,
    session,
    status: 'running',
    startedAt: new Date().toISOString(),
  };

  MANAGED_SESSIONS.set(display, spawned);

  logger.info(`VNC session spawned: display=:${display}, port=${port}, user=${user}`);
  return spawned;
}

/**
 * Stop a TuxPanel-managed VNC session.
 */
export async function stopSession(display: number): Promise<void> {
  logger.info(`Stopping VNC session on display :${display}`);

  try {
    await run('systemctlAction', ['stop', `vncserver@:${display}.service`], { timeout: 15000 });
  } catch (err: any) {
    logger.warn(`Failed to stop vncserver@:${display}: ${err.message}`);
  }

  await removeUserMapping(display).catch(() => {});
  MANAGED_SESSIONS.delete(display);

  logger.info(`VNC session :${display} stopped and cleaned up`);
}

/**
 * Scan systemd for running vncserver@ units and merge them into
 * MANAGED_SESSIONS.  Also refreshes status of already-tracked sessions
 * and prunes units that have stopped.
 */
async function hydrateFromSystemd(): Promise<void> {
  try {
    // list-units --all gives us every vncserver@ unit systemd knows about
    const { stdout } = await run('systemctlListAll', []);

    // Collect displays whose unit is currently active+running
    const activeDisplays = new Set<number>();
    for (const line of stdout.split('\n')) {
      // e.g. "  vncserver@:10.service  loaded  active  running  …"
      const m = line.match(/vncserver@:(\d+)\.service\s+\S+\s+active\s+running/);
      if (m) activeDisplays.add(parseInt(m[1], 10));
    }

    // Cross-reference with /etc/tigervnc/vncserver.users for usernames
    const mappings = activeDisplays.size > 0 ? await readUserMappings() : new Map();

    // Add any running sessions we weren't tracking yet
    for (const display of activeDisplays) {
      if (!MANAGED_SESSIONS.has(display)) {
        const user = mappings.get(display) || 'unknown';
        MANAGED_SESSIONS.set(display, {
          display,
          port: 5900 + display,
          user,
          session: 'detected',
          status: 'running',
          startedAt: 'pre-existing',
        });
        logger.info(`Hydrated VNC session: display=:${display}, user=${user}`);
      }
    }

    // Refresh status for every tracked session
    for (const [display, session] of MANAGED_SESSIONS) {
      if (activeDisplays.has(display)) {
        session.status = 'running';
      } else {
        // Unit is no longer running — mark and clean up
        session.status = 'failed';
      }
    }
  } catch (err: any) {
    logger.debug(`VNC session hydration failed: ${err.message}`);
  }
}

/**
 * List all TuxPanel-managed spawned sessions and their current status.
 * Automatically discovers sessions started outside this process.
 */
export async function listManagedSessions(): Promise<SpawnedSession[]> {
  await hydrateFromSystemd();
  return Array.from(MANAGED_SESSIONS.values());
}

/**
 * Get the map of currently tracked sessions (for route access).
 */
export function getManagedSessionsMap(): Map<number, SpawnedSession> {
  return MANAGED_SESSIONS;
}
