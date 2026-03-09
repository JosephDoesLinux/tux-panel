/**
 * Discovery Service — scans the host and Docker containers for
 * VNC / RDP endpoints, parses available X sessions, and enumerates
 * system users eligible for headless session spawning.
 *
 * All system commands go through the allow-listed `commandRunner`.
 */

import { execFile } from 'child_process';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { run } from '../utils/commandRunner';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);

/* ══════════════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════════════ */

export interface DiscoveredPort {
  /** 'host' or the Docker container name/ID */
  source: string;
  /** 'vnc' | 'rdp' */
  protocol: 'vnc' | 'rdp';
  host: string;
  port: number;
  /** Process name or Docker container name */
  process: string;
  /** Extra metadata */
  meta?: Record<string, string>;
}

export interface XSession {
  /** Filename stem, e.g. "plasma" */
  id: string;
  /** Human-readable name from Name= key */
  name: string;
  /** Exec line from the .desktop file */
  exec: string;
  /** Comment / description */
  comment: string;
  /** Where it was found: 'xsessions' | 'wayland-sessions' */
  type: 'xsession' | 'wayland-session';
}

export interface SystemUser {
  username: string;
  uid: number;
  gid: number;
  home: string;
  shell: string;
  /** Whether a ~/.vnc directory already exists */
  hasVncDir: boolean;
}

export interface DiscoveryResult {
  vnc: {
    host: DiscoveredPort[];
    docker: DiscoveredPort[];
  };
  rdp: {
    host: DiscoveredPort[];
    docker: DiscoveredPort[];
  };
  sessions: XSession[];
  users: SystemUser[];
  /** Binaries available on this host (dynamically discovered) */
  capabilities: Record<string, boolean>;
}

/* ══════════════════════════════════════════════════════════════════════
   1. Host Port Scanning  (ss -tlnp)
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Parse `ss -tlnp` output and extract VNC (59xx) and RDP (3389) listeners.
 */
async function scanHostPorts(): Promise<{ vnc: DiscoveredPort[]; rdp: DiscoveredPort[] }> {
  const vnc: DiscoveredPort[] = [];
  const rdp: DiscoveredPort[] = [];

  try {
    const { stdout } = await run('ssListening', []);

    // Well-known RDP process names (detected regardless of port)
    const RDP_PROCESSES = new Set(['krdpserver', 'xrdp', 'xrdp-sesman', 'gnome-remote-desktop', 'freerdp-shadow']);

    // Track seen port+process combos to deduplicate IPv4/IPv6 dual-stack entries
    const seenVnc = new Set<string>();
    const seenRdp = new Set<string>();

    for (const line of stdout.split('\n')) {
      const portMatch = line.match(/\s(\S+):(\d+)\s/);
      if (!portMatch) continue;

      const listenAddr = portMatch[1];
      const port = parseInt(portMatch[2], 10);

      // Extract process name from users:(("name",pid=...,fd=...))
      const procMatch = line.match(/users:\(\("([^"]+)"/);
      const processName = procMatch ? procMatch[1] : 'unknown';
      const normHost = listenAddr === '0.0.0.0' || listenAddr === '[::]' || listenAddr === '*' ? '127.0.0.1' : listenAddr;

      // VNC range: 5900–5999 (deduplicate dual-stack entries)
      if (port >= 5900 && port <= 5999) {
        const key = `${port}:${processName}`;
        if (!seenVnc.has(key)) {
          seenVnc.add(key);
          vnc.push({
            source: 'host',
            protocol: 'vnc',
            host: normHost,
            port,
            process: processName,
            meta: { display: `:${port - 5900}` },
          });
        }
      }

      // RDP: port 3389 or any well-known RDP process on any port
      if (port === 3389 || RDP_PROCESSES.has(processName)) {
        const key = `${port}:${processName}`;
        if (!seenRdp.has(key)) {
          seenRdp.add(key);
          rdp.push({
            source: 'host',
            protocol: 'rdp',
            host: normHost,
            port,
            process: processName,
          });
        }
      }
    }
  } catch (err: any) {
    logger.warn(`Host port scan failed: ${err.message}`);
  }

  return { vnc, rdp };
}

/* ══════════════════════════════════════════════════════════════════════
   2. Docker Container Port Scanning
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Scan running Docker containers for exposed VNC/RDP ports.
 * Uses `docker ps --format json` (NDJSON).
 */
async function scanDockerPorts(): Promise<{ vnc: DiscoveredPort[]; rdp: DiscoveredPort[] }> {
  const vnc: DiscoveredPort[] = [];
  const rdp: DiscoveredPort[] = [];

  try {
    const { stdout } = await run('dockerPs', []);
    if (!stdout.trim()) return { vnc, rdp };

    const containers = stdout
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));

    // Deduplicate: docker ps can emit the same container multiple times
    const seenIds = new Set<string>();
    const unique = containers.filter((c: any) => {
      const id = c.ID || c.Id;
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

    for (const c of unique) {
      // c.Ports looks like: "127.0.0.1:47300->3389/tcp, 127.0.0.1:47300->3389/udp, ..."
      const portsStr: string = c.Ports || '';
      const name: string = c.Names || c.ID || 'unknown';
      const state: string = c.State || '';

      // Parse each port mapping
      // Format: [host_ip:]host_port->container_port/proto
      const portMappings = portsStr.split(',').map((p: string) => p.trim()).filter(Boolean);

      // Deduplicate tcp/udp entries for the same host_port -> container_port
      const seenMappings = new Set<string>();

      for (const mapping of portMappings) {
        const m = mapping.match(/(?:(\d+\.\d+\.\d+\.\d+):)?(\d+)->(\d+)\/(tcp|udp)/);
        if (!m) continue;

        const hostIp = m[1] || '0.0.0.0';
        const hostPort = parseInt(m[2], 10);
        const containerPort = parseInt(m[3], 10);

        const mapKey = `${hostPort}->${containerPort}`;
        if (seenMappings.has(mapKey)) continue;
        seenMappings.add(mapKey);

        // VNC: container port in 5900-5999 range
        if (containerPort >= 5900 && containerPort <= 5999) {
          vnc.push({
            source: `docker:${name}`,
            protocol: 'vnc',
            host: hostIp === '0.0.0.0' ? '127.0.0.1' : hostIp,
            port: hostPort,
            process: name,
            meta: {
              containerId: c.ID,
              containerState: state,
              containerPort: String(containerPort),
              display: `:${containerPort - 5900}`,
            },
          });
        }

        // RDP: container port 3389
        if (containerPort === 3389) {
          rdp.push({
            source: `docker:${name}`,
            protocol: 'rdp',
            host: hostIp === '0.0.0.0' ? '127.0.0.1' : hostIp,
            port: hostPort,
            process: name,
            meta: {
              containerId: c.ID,
              containerState: state,
              containerPort: String(containerPort),
            },
          });
        }
      }
    }
  } catch (err: any) {
    // Docker might not be installed/running
    logger.debug(`Docker port scan failed: ${err.message}`);
  }

  return { vnc, rdp };
}

/* ══════════════════════════════════════════════════════════════════════
   3. X Session Parsing  (/usr/share/xsessions + wayland-sessions)
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Parse a .desktop file and extract Name, Exec, Comment.
 */
function parseDesktopFile(raw: string): { name: string; exec: string; comment: string } {
  const entries: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    // Only take unlocalized keys (Name=, not Name[fr]=)
    const kv = t.match(/^(Name|Exec|TryExec|Comment|DesktopNames)=(.+)$/);
    if (kv && !entries[kv[1]]) {
      entries[kv[1]] = kv[2];
    }
  }
  return {
    name: entries.Name || entries.DesktopNames || 'Unknown',
    exec: entries.Exec || entries.TryExec || '',
    comment: entries.Comment || '',
  };
}

/**
 * Scan /usr/share/xsessions and /usr/share/wayland-sessions for
 * available Desktop Environment .desktop files.
 */
async function discoverSessions(): Promise<XSession[]> {
  const sessions: XSession[] = [];

  const dirs: Array<{ dir: string; type: XSession['type'] }> = [
    { dir: '/usr/share/xsessions', type: 'xsession' },
    { dir: '/usr/share/wayland-sessions', type: 'wayland-session' },
  ];

  for (const { dir, type } of dirs) {
    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.desktop')) continue;
        try {
          const raw = await readFile(path.join(dir, file), 'utf-8');
          const parsed = parseDesktopFile(raw);
          sessions.push({
            id: file.replace('.desktop', ''),
            name: parsed.name,
            exec: parsed.exec,
            comment: parsed.comment,
            type,
          });
        } catch (err: any) {
          logger.debug(`Failed to parse ${file}: ${err.message}`);
        }
      }
    } catch {
      // Directory doesn't exist — that's fine
    }
  }

  return sessions;
}

/* ══════════════════════════════════════════════════════════════════════
   4. System Users Eligible for VNC Sessions
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Enumerate real system users (uid >= 1000, has a login shell).
 * Also checks for an existing ~/.vnc directory.
 */
async function discoverUsers(): Promise<SystemUser[]> {
  const users: SystemUser[] = [];

  try {
    const { stdout } = await run('userList', []);

    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      // Format: name:x:uid:gid:gecos:home:shell
      const parts = line.split(':');
      if (parts.length < 7) continue;

      const uid = parseInt(parts[2], 10);
      const shell = parts[6];

      // Skip system users and nologin shells
      if (uid < 1000) continue;
      if (shell.includes('nologin') || shell.includes('false')) continue;
      // Skip the nobody user
      if (parts[0] === 'nobody') continue;

      let hasVncDir = false;
      try {
        const { readdir: readdirSync } = await import('fs/promises');
        await readdirSync(path.join(parts[5], '.vnc'));
        hasVncDir = true;
      } catch {
        // No .vnc directory
      }

      users.push({
        username: parts[0],
        uid,
        gid: parseInt(parts[3], 10),
        home: parts[5],
        shell,
        hasVncDir,
      });
    }
  } catch (err: any) {
    logger.warn(`User enumeration failed: ${err.message}`);
  }

  return users;
}

/* ══════════════════════════════════════════════════════════════════════
   5. Capability Detection (which binaries are available?)
   ══════════════════════════════════════════════════════════════════════ */

async function whichExists(bin: string): Promise<boolean> {
  try {
    const { stdout } = await run('whichBin', [bin]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Well-known remote-desktop binaries to probe for.
 * Easy to extend — just add entries here.
 */
const CAPABILITY_BINARIES = [
  'vncserver', 'Xvnc', 'x11vnc', 'krfb', 'krdc',
  'guacd', 'xfreerdp', 'krdpserver', 'xrdp',
  'gnome-remote-desktop', 'grdctl', 'vncviewer',
];

/** Cache for capability binary detection (installed binaries don't change at runtime). */
let capabilityCache: Record<string, boolean> | null = null;

async function detectCapabilityBinaries(): Promise<Record<string, boolean>> {
  if (capabilityCache) return capabilityCache;

  const results = await Promise.all(
    CAPABILITY_BINARIES.map(async (bin) => [bin, await whichExists(bin)] as const),
  );

  const caps: Record<string, boolean> = {};
  for (const [bin, found] of results) {
    caps[bin] = found;
  }
  capabilityCache = caps;
  logger.info(`Capability scan done (cached): ${Object.entries(caps).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none found'}`);
  return caps;
}

/* ══════════════════════════════════════════════════════════════════════
   6. Full Discovery  (aggregates everything)
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Run a full discovery scan. Returns aggregated VNC/RDP endpoints,
 * available sessions, eligible users, and host capabilities.
 */
export async function runFullDiscovery(): Promise<DiscoveryResult> {
  const [hostPorts, dockerPorts, sessions, users, capabilities] =
    await Promise.all([
      scanHostPorts(),
      scanDockerPorts(),
      discoverSessions(),
      discoverUsers(),
      detectCapabilityBinaries(),
    ]);

  const result: DiscoveryResult = {
    vnc: {
      host: hostPorts.vnc,
      docker: dockerPorts.vnc,
    },
    rdp: {
      host: hostPorts.rdp,
      docker: dockerPorts.rdp,
    },
    sessions,
    users,
    capabilities,
  };

  logger.info(
    `Discovery complete: VNC[host=${result.vnc.host.length},docker=${result.vnc.docker.length}] ` +
    `RDP[host=${result.rdp.host.length},docker=${result.rdp.docker.length}] ` +
    `sessions=${sessions.length} users=${users.length}`
  );

  return result;
}

// Export individual scans for granular API usage
export {
  scanHostPorts,
  scanDockerPorts,
  discoverSessions,
  discoverUsers,
  detectCapabilityBinaries,
};
