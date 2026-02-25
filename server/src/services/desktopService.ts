/**
 * Desktop Service — Detects the running desktop environment and manages
 * the local RDP/VNC server that shares the current Wayland/X11 session.
 *
 * Supported DEs:
 *   • KDE Plasma 6 (Wayland)  → krdpserver (RDP, native PipeWire capture)
 *   • KDE Plasma (fallback)   → krfb (VNC)
 *   • GNOME 42+ (Wayland)     → gnome-remote-desktop (RDP)
 *   • X11 (any DE)            → x11vnc fallback
 */

import { execFile  } from 'child_process';
import { promisify  } from 'util';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);

// ── Detect desktop environment ───────────────────────────────────────
function detectDesktop() {
  return {
    desktop: process.env.XDG_CURRENT_DESKTOP || 'unknown',
    sessionType: process.env.XDG_SESSION_TYPE || 'unknown',
    waylandDisplay: process.env.WAYLAND_DISPLAY || null,
    display: process.env.DISPLAY || null,
  };
}

// ── Check if a binary exists ─────────────────────────────────────────
async function which(bin: string) {
  try {
    const { stdout } = await execFileAsync('/usr/bin/which', [bin], { timeout: 3000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

// ── Check if krdpserver is already listening ─────────────────────────
async function isKrdpRunning() {
  try {
    const { stdout } = await execFileAsync('/usr/bin/ss', ['-tlnp'], { timeout: 5000 });
    return stdout.includes('krdpserver');
  } catch {
    return false;
  }
}

// ── Check if krfb is already listening ───────────────────────────────
async function isKrfbRunning() {
  try {
    const { stdout } = await execFileAsync('/usr/bin/ss', ['-tlnp'], { timeout: 5000 });
    return stdout.includes('krfb');
  } catch {
    return false;
  }
}

// ── Determine the best sharing strategy ──────────────────────────────
async function detectCapabilities() {
  const desktop = detectDesktop();

  const [krdpPath, krfbPath, grdctlPath] = await Promise.all([
    which('krdpserver'),
    which('krfb'),
    which('grdctl'),
  ]);

  const [krdpRunning, krfbRunning] = await Promise.all([
    isKrdpRunning(),
    isKrfbRunning(),
  ]);

  // Build a prioritised list of available providers
  const providers = [];

  if (krdpPath) {
    providers.push({
      id: 'krdp',
      name: 'KDE RDP Server (krdpserver)',
      protocol: 'rdp',
      binary: krdpPath,
      running: krdpRunning,
      defaultPort: 3389,
      priority: desktop.desktop.includes('KDE') ? 1 : 3,
    });
  }

  if (krfbPath) {
    providers.push({
      id: 'krfb',
      name: 'KDE Desktop Sharing (krfb)',
      protocol: 'vnc',
      binary: krfbPath,
      running: krfbRunning,
      defaultPort: 5900,
      priority: desktop.desktop.includes('KDE') ? 2 : 4,
    });
  }

  if (grdctlPath) {
    providers.push({
      id: 'gnome-rd',
      name: 'GNOME Remote Desktop',
      protocol: 'rdp',
      binary: grdctlPath,
      running: false, // TODO: check systemctl --user
      defaultPort: 3389,
      priority: desktop.desktop.includes('GNOME') ? 1 : 5,
    });
  }

  // Sort by priority (lower = better)
  providers.sort((a, b) => a.priority - b.priority);

  return { desktop, providers };
}

// ── Get the port krdpserver is listening on ──────────────────────────
async function getKrdpPort() {
  try {
    const { stdout } = await execFileAsync('/usr/bin/ss', ['-tlnp'], { timeout: 5000 });
    const match = stdout.match(/\*:(\d+).*krdpserver/);
    return match ? parseInt(match[1], 10) : 3389;
  } catch {
    return 3389;
  }
}

// ── Get connection info for the best running provider ────────────────
async function getActiveConnection() {
  const { desktop, providers } = await detectCapabilities();

  // Find a running provider, or the best available one
  let active = providers.find((p) => p.running);

  if (!active && providers.length > 0) {
    // None running — return the best candidate with instructions
    return {
      desktop,
      status: 'not-running',
      bestProvider: providers[0],
      message: `${providers[0].name} is installed but not running. Start it to enable remote desktop.`,
    };
  }

  if (!active) {
    return {
      desktop,
      status: 'unavailable',
      message: 'No RDP/VNC server found. Install krdp (KDE) or gnome-remote-desktop (GNOME).',
    };
  }

  // Determine actual port
  let port = active.defaultPort;
  if (active.id === 'krdp') {
    port = await getKrdpPort();
  }

  return {
    desktop,
    status: 'running',
    provider: {
      ...active,
      port,
      host: '127.0.0.1',
    },
  };
}

export { 
  detectDesktop,
  detectCapabilities,
  getActiveConnection,
  getKrdpPort,
 };
