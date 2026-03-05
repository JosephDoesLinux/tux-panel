/**
 * Desktop Service — Detects the running desktop environment and manages
 * the local VNC server that shares the current Wayland/X11 session.
 *
 * Primary provider:
 *   • KDE Plasma (Wayland/X11) → krfb (VNC, PipeWire capture on Wayland)
 *
 * Fallbacks:
 *   • GNOME (Wayland) → gnome-remote-desktop (VNC mode)
 *   • X11 (any DE)    → x11vnc
 *
 * Config: reads ~/.config/krfbrc (KDE INI format) for port, security,
 * and framebuffer settings.
 */

import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';
import { promisify } from 'util';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);

/* ── Types ────────────────────────────────────────────────────────── */

interface KrfbConfig {
  /** Raw parsed sections */
  sections: Record<string, Record<string, string>>;
  /** Effective VNC port (default 5900) */
  port: number;
  /** Whether unattended (passwordless prompt) access is allowed */
  allowUnattendedAccess: boolean;
  /** PipeWire or xcb framebuffer plugin */
  framebufferPlugin: string;
}

interface DesktopInfo {
  desktop: string;
  sessionType: string;
  waylandDisplay: string | null;
  display: string | null;
}

interface Provider {
  id: string;
  name: string;
  protocol: string;
  binary: string;
  running: boolean;
  port: number;
  host: string;
  priority: number;
}

/* ── Parse ~/.config/krfbrc ───────────────────────────────────────── */

async function readKrfbConfig(): Promise<KrfbConfig | null> {
  const configPath = path.join(homedir(), '.config', 'krfbrc');

  try {
    const raw = await readFile(configPath, 'utf-8');
    const sections: Record<string, Record<string, string>> = {};
    let currentSection = 'General';
    sections[currentSection] = {};

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

      const secMatch = trimmed.match(/^\[(.+)\]$/);
      if (secMatch) {
        currentSection = secMatch[1];
        sections[currentSection] = sections[currentSection] || {};
        continue;
      }

      const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
      if (kvMatch) {
        sections[currentSection][kvMatch[1].trim()] = kvMatch[2].trim();
      }
    }

    const tcp = sections['TCP'] || {};
    const security = sections['Security'] || {};
    const fb = sections['FrameBuffer'] || {};

    const config: KrfbConfig = {
      sections,
      port: parseInt(tcp['port'] || '5900', 10),
      allowUnattendedAccess: security['allowUnattendedAccess'] === 'true',
      framebufferPlugin: fb['preferredFrameBufferPlugin'] || 'pw',
    };

    logger.info(`krfbrc loaded — port=${config.port}, unattended=${config.allowUnattendedAccess}, fb=${config.framebufferPlugin}`);
    return config;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      logger.debug('No krfbrc found at ~/.config/krfbrc');
    } else {
      logger.warn(`Failed to read krfbrc: ${err.message}`);
    }
    return null;
  }
}

/* ── Detect desktop environment ───────────────────────────────────── */

function detectDesktop(): DesktopInfo {
  return {
    desktop: process.env.XDG_CURRENT_DESKTOP || 'unknown',
    sessionType: process.env.XDG_SESSION_TYPE || 'unknown',
    waylandDisplay: process.env.WAYLAND_DISPLAY || null,
    display: process.env.DISPLAY || null,
  };
}

/* ── Check if a binary exists ─────────────────────────────────────── */

async function which(bin: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('/usr/bin/which', [bin], { timeout: 3000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

/* ── Check krfb running status ────────────────────────────────────── */
// krfb typically runs as a KDE GUI application, not a systemd user
// service. We try systemctl --user first (some distros ship a unit),
// then fall back to checking the listening socket via ss(8).

async function checkKrfbStatus(): Promise<{ running: boolean; port: number }> {
  // 1. Try systemctl --user (works if a krfb.service unit exists)
  try {
    const { stdout } = await execFileAsync(
      'systemctl', ['--user', 'status', 'krfb'],
      { timeout: 5000 },
    );
    if (stdout.includes('active (running)')) {
      logger.debug('krfb detected via systemctl --user (active)');
      return { running: true, port: 5900 };
    }
  } catch {
    // Unit not found or inactive — fall through
  }

  // 2. Check listening sockets via ss (works for GUI-launched krfb)
  try {
    const { stdout } = await execFileAsync('/usr/bin/ss', ['-tlnp'], { timeout: 5000 });

    // Look for krfb in the output and extract the actual port
    for (const line of stdout.split('\n')) {
      if (!line.includes('krfb')) continue;

      // Match patterns like  0.0.0.0:5900  or  *:5900
      const portMatch = line.match(/:(\d+)\s/);
      const port = portMatch ? parseInt(portMatch[1], 10) : 5900;
      logger.debug(`krfb detected via ss — listening on port ${port}`);
      return { running: true, port };
    }
  } catch {
    // ss not available
  }

  // 3. Last resort: check if the krfb process exists
  try {
    await execFileAsync('/usr/bin/pgrep', ['-x', 'krfb'], { timeout: 3000 });
    logger.debug('krfb process found via pgrep (but not listening?)');
    return { running: true, port: 5900 };
  } catch {
    // not running
  }

  return { running: false, port: 5900 };
}

/* ── Detect all available providers ───────────────────────────────── */

async function detectCapabilities() {
  const desktop = detectDesktop();
  const krfbConfig = await readKrfbConfig();

  const [krfbPath, grdctlPath, x11vncPath] = await Promise.all([
    which('krfb'),
    which('grdctl'),
    which('x11vnc'),
  ]);

  const krfbStatus = await checkKrfbStatus();

  const providers: Provider[] = [];

  if (krfbPath) {
    providers.push({
      id: 'krfb',
      name: 'KDE Desktop Sharing (krfb)',
      protocol: 'vnc',
      binary: krfbPath,
      running: krfbStatus.running,
      port: krfbConfig?.port ?? krfbStatus.port,
      host: '127.0.0.1',
      priority: desktop.desktop.includes('KDE') ? 1 : 2,
    });
  }

  if (x11vncPath && desktop.sessionType === 'x11') {
    providers.push({
      id: 'x11vnc',
      name: 'x11vnc',
      protocol: 'vnc',
      binary: x11vncPath,
      running: false, // TODO: detect
      port: 5900,
      host: '127.0.0.1',
      priority: 3,
    });
  }

  if (grdctlPath) {
    providers.push({
      id: 'gnome-rd',
      name: 'GNOME Remote Desktop',
      protocol: 'vnc',
      binary: grdctlPath,
      running: false, // TODO: detect
      port: 5900,
      host: '127.0.0.1',
      priority: desktop.desktop.includes('GNOME') ? 1 : 5,
    });
  }

  // Lower number = higher priority
  providers.sort((a, b) => a.priority - b.priority);

  return { desktop, providers, krfbConfig };
}

/* ── Get active VNC connection info ───────────────────────────────── */

async function getActiveConnection() {
  const { desktop, providers, krfbConfig } = await detectCapabilities();

  // Prefer a running provider
  const active = providers.find((p) => p.running);

  if (!active && providers.length > 0) {
    return {
      desktop,
      status: 'not-running',
      bestProvider: providers[0],
      krfbConfig: krfbConfig ? {
        port: krfbConfig.port,
        unattendedAccess: krfbConfig.allowUnattendedAccess,
        framebuffer: krfbConfig.framebufferPlugin,
      } : null,
      message: `${providers[0].name} is installed but not running. Start it to enable remote desktop.`,
    };
  }

  if (!active) {
    return {
      desktop,
      status: 'unavailable',
      message: 'No VNC server found. Install krfb (KDE), x11vnc, or gnome-remote-desktop.',
    };
  }

  return {
    desktop,
    status: 'running',
    provider: {
      id: active.id,
      name: active.name,
      protocol: active.protocol,
      port: active.port,
      host: active.host,
    },
    krfbConfig: krfbConfig ? {
      port: krfbConfig.port,
      unattendedAccess: krfbConfig.allowUnattendedAccess,
      framebuffer: krfbConfig.framebufferPlugin,
    } : null,
  };
}

export {
  detectDesktop,
  detectCapabilities,
  getActiveConnection,
  readKrfbConfig,
};
