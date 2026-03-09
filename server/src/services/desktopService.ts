/**
 * Desktop Service — Detects the running desktop environment and
 * discovers active VNC / RDP servers generically by scanning
 * listening ports via `ss -tlnp`.
 *
 * No assumptions are made about which server software the user runs.
 * Active endpoints are identified purely by port range and the
 * process name reported by the kernel.
 */

import { scanHostPorts, detectCapabilityBinaries } from './discoveryService';
import logger from '../utils/logger';

/* ── Types ────────────────────────────────────────────────────────── */

interface DesktopInfo {
  desktop: string;
  sessionType: string;
  waylandDisplay: string | null;
  display: string | null;
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

/* ── Get active VNC / RDP connection (generic) ────────────────────── */

/**
 * Scan listening ports and return the first active VNC or RDP
 * endpoint. Works with any VNC/RDP server (TigerVNC, x11vnc,
 * krfb, krdpserver, xrdp, gnome-remote-desktop, etc.).
 */
async function getActiveConnection() {
  const desktop = detectDesktop();

  try {
    const { vnc, rdp } = await scanHostPorts();

    // Prefer VNC endpoints (direct noVNC proxy support)
    if (vnc.length > 0) {
      const active = vnc[0];
      logger.debug(`Active VNC detected: ${active.process} on ${active.host}:${active.port}`);
      return {
        desktop,
        status: 'running',
        provider: {
          id: active.process,
          name: active.process,
          protocol: 'vnc' as const,
          port: active.port,
          host: active.host,
        },
      };
    }

    // Fall back to RDP endpoints
    if (rdp.length > 0) {
      const active = rdp[0];
      logger.debug(`Active RDP detected: ${active.process} on ${active.host}:${active.port}`);
      return {
        desktop,
        status: 'running',
        provider: {
          id: active.process,
          name: active.process,
          protocol: 'rdp' as const,
          port: active.port,
          host: active.host,
        },
      };
    }

    return {
      desktop,
      status: 'unavailable',
      message: 'No VNC or RDP server detected on any listening port.',
    };
  } catch (err: any) {
    logger.warn(`Active connection detection failed: ${err.message}`);
    return {
      desktop,
      status: 'unavailable',
      message: `Detection failed: ${err.message}`,
    };
  }
}

/* ── Detect capabilities (generic) ────────────────────────────────── */

/**
 * Detect available provider binaries and any currently listening
 * VNC / RDP endpoints. Uses discoveryService under the hood.
 */
async function detectCapabilities() {
  const desktop = detectDesktop();
  const [{ vnc, rdp }, capabilities] = await Promise.all([
    scanHostPorts(),
    detectCapabilityBinaries(),
  ]);

  const providers = [
    ...vnc.map((v) => ({
      id: v.process,
      name: v.process,
      protocol: 'vnc' as const,
      port: v.port,
      host: v.host,
      running: true,
    })),
    ...rdp.map((r) => ({
      id: r.process,
      name: r.process,
      protocol: 'rdp' as const,
      port: r.port,
      host: r.host,
      running: true,
    })),
  ];

  return { desktop, providers, capabilities };
}

export {
  detectDesktop,
  detectCapabilities,
  getActiveConnection,
};
