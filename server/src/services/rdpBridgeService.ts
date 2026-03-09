/**
 * RDP Bridge Service — connects to an RDP target via xfreerdp
 * inside a headless Xvnc display, exposing it as a local VNC port.
 *
 * Flow:
 *   1. Pick a free display number (:50 .. :99) and VNC port (5950 .. 5999)
 *   2. Start Xvnc on that display (SecurityTypes None, localhost only)
 *   3. Launch xfreerdp inside that display, connecting to the RDP target
 *   4. Return the local VNC port — the frontend connects via the existing
 *      noVNC WebSocket proxy
 *   5. Track sessions for cleanup
 */

import { execFile, ChildProcess } from 'child_process';
import net from 'net';
import logger from '../utils/logger';

/* ── Types ─────────────────────────────────────────────────────────── */

interface BridgeSession {
  id: string;
  rdpHost: string;
  rdpPort: number;
  username: string;
  vncDisplay: number;
  vncPort: number;
  xvncProcess: ChildProcess;
  xfreerdpProcess: ChildProcess | null;
  createdAt: Date;
}

/* ── State ─────────────────────────────────────────────────────────── */

const activeBridges = new Map<string, BridgeSession>();

/** Display range for bridge sessions */
const DISPLAY_MIN = 50;
const DISPLAY_MAX = 99;

/* ── Helpers ───────────────────────────────────────────────────────── */

/** Check if a TCP port is available */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, '127.0.0.1');
  });
}

/** Find a free display number + VNC port pair */
async function findFreeDisplay(): Promise<{ display: number; port: number }> {
  for (let d = DISPLAY_MIN; d <= DISPLAY_MAX; d++) {
    const port = 5900 + d;
    // Check both port and existing sessions
    if (activeBridges.has(`bridge-${d}`)) continue;
    if (await isPortFree(port)) {
      return { display: d, port };
    }
  }
  throw new Error('No free display numbers available for RDP bridge');
}

/** Wait for a TCP port to become connectable */
function waitForPort(port: number, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Timed out waiting for port ${port}`));
      }
      const sock = net.connect(port, '127.0.0.1');
      sock.on('connect', () => {
        sock.destroy();
        resolve();
      });
      sock.on('error', () => {
        sock.destroy();
        setTimeout(tryConnect, 200);
      });
    };
    tryConnect();
  });
}

/* ── Bridge Lifecycle ──────────────────────────────────────────────── */

export interface BridgeOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  geometry?: string;
}

/**
 * Start an RDP bridge session.
 *
 * Creates: Xvnc display → xfreerdp connection → local VNC port
 * Returns the VNC host/port the frontend should connect to.
 */
export async function startBridge(opts: BridgeOptions): Promise<{
  vncHost: string;
  vncPort: number;
  bridgeId: string;
}> {
  const { host, port, username, password, geometry = '1920x1080' } = opts;

  // Check for existing bridge to the same target
  for (const [, session] of activeBridges) {
    if (session.rdpHost === host && session.rdpPort === port && session.username === username) {
      logger.info(`Reusing existing RDP bridge ${session.id} → ${host}:${port}`);
      return {
        vncHost: '127.0.0.1',
        vncPort: session.vncPort,
        bridgeId: session.id,
      };
    }
  }

  const { display, port: vncPort } = await findFreeDisplay();
  const bridgeId = `bridge-${display}`;

  logger.info(`Starting RDP bridge: ${bridgeId} → ${host}:${port} (VNC :${display} on port ${vncPort})`);

  // ── Step 1: Start Xvnc ────────────────────────────────────────────
  const xvncArgs = [
    `:${display}`,
    '-geometry', geometry,
    '-depth', '24',
    '-SecurityTypes', 'None',
    '-localhost',
    '-rfbport', String(vncPort),
    '-AlwaysShared',
    '-AcceptKeyEvents',
    '-AcceptPointerEvents',
    '-AcceptSetDesktopSize',
  ];

  const xvncProcess = execFile('/usr/bin/Xvnc', xvncArgs);

  xvncProcess.on('error', (err) => {
    logger.error(`Xvnc ${bridgeId} error: ${err.message}`);
    cleanupBridge(bridgeId);
  });

  xvncProcess.on('exit', (code) => {
    logger.info(`Xvnc ${bridgeId} exited with code ${code}`);
    cleanupBridge(bridgeId);
  });

  // Capture stderr for debugging
  xvncProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) logger.debug(`Xvnc ${bridgeId}: ${msg}`);
  });

  // ── Step 2: Wait for Xvnc to be ready ─────────────────────────────
  try {
    await waitForPort(vncPort, 8000);
  } catch {
    xvncProcess.kill();
    throw new Error('Xvnc failed to start — timed out waiting for VNC port');
  }

  logger.info(`Xvnc ${bridgeId} ready on port ${vncPort}`);

  // ── Step 3: Start xfreerdp ────────────────────────────────────────
  const xfreerdpArgs = [
    `/v:${host}:${port}`,
    `/u:${username}`,
    `/p:${password}`,
    `/size:${geometry}`,
    '+clipboard',
    '/cert:ignore',
    '/dynamic-resolution',
    '-wallpaper',
    '-themes',
  ];

  const env = {
    ...process.env,
    DISPLAY: `:${display}`,
  };

  const xfreerdpProcess = execFile('/usr/bin/xfreerdp', xfreerdpArgs, { env });

  xfreerdpProcess.on('error', (err) => {
    logger.error(`xfreerdp ${bridgeId} error: ${err.message}`);
    cleanupBridge(bridgeId);
  });

  xfreerdpProcess.on('exit', (code) => {
    logger.info(`xfreerdp ${bridgeId} exited with code ${code}`);
    // Don't immediately cleanup — user might want to reconnect or see the error
    // Cleanup after a grace period
    setTimeout(() => {
      if (activeBridges.has(bridgeId)) {
        cleanupBridge(bridgeId);
      }
    }, 5000);
  });

  xfreerdpProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) logger.debug(`xfreerdp ${bridgeId}: ${msg}`);
  });

  // ── Step 4: Register the session ──────────────────────────────────
  const session: BridgeSession = {
    id: bridgeId,
    rdpHost: host,
    rdpPort: port,
    username,
    vncDisplay: display,
    vncPort,
    xvncProcess,
    xfreerdpProcess,
    createdAt: new Date(),
  };

  activeBridges.set(bridgeId, session);

  // Give xfreerdp a moment to establish the RDP connection
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Check if xfreerdp is still running
  if (xfreerdpProcess.exitCode !== null) {
    cleanupBridge(bridgeId);
    throw new Error(
      'xfreerdp exited immediately — check RDP credentials, hostname, and that the target is reachable'
    );
  }

  logger.info(`RDP bridge ${bridgeId} established: ${host}:${port} → VNC :${vncPort}`);

  return {
    vncHost: '127.0.0.1',
    vncPort,
    bridgeId,
  };
}

/**
 * Stop and cleanup a bridge session.
 */
export function cleanupBridge(bridgeId: string): void {
  const session = activeBridges.get(bridgeId);
  if (!session) return;

  logger.info(`Cleaning up RDP bridge ${bridgeId}`);

  try { session.xfreerdpProcess?.kill(); } catch {}
  try { session.xvncProcess.kill(); } catch {}

  activeBridges.delete(bridgeId);
}

/**
 * List active bridge sessions (for status display).
 */
export function listBridges(): Array<{
  id: string;
  rdpHost: string;
  rdpPort: number;
  username: string;
  vncPort: number;
  createdAt: string;
}> {
  return Array.from(activeBridges.values()).map((s) => ({
    id: s.id,
    rdpHost: s.rdpHost,
    rdpPort: s.rdpPort,
    username: s.username,
    vncPort: s.vncPort,
    createdAt: s.createdAt.toISOString(),
  }));
}

/**
 * Cleanup all bridge sessions (called on server shutdown).
 */
export function cleanupAllBridges(): void {
  for (const [id] of activeBridges) {
    cleanupBridge(id);
  }
}
