/**
 * TuxPanel — Server Entry Point
 *
 * Boots Express + Socket.io, wires middleware, mounts API routes,
 * and starts the real-time terminal namespace.
 */

import dotenv from 'dotenv';
dotenv.config();
import http from 'http';
import https from 'https';
import fs from 'fs';
import app from './app';
import { initSocketIO  } from './sockets';
import { initVncProxy, getWebSocketServer  } from './services/vncService';
import { cleanupAllBridges } from './services/rdpBridgeService';
import { authenticateSocket } from './middleware/auth';
import logger from './utils/logger';

const PORT = parseInt(process.env.TUXPANEL_PORT || process.env.PORT || '3001', 10);
const TLS_MODE = process.env.TUXPANEL_TLS_MODE || 'none';

// ── HTTP + WebSocket Server ───────────────────────────────────────────
let server: http.Server | https.Server;

if (TLS_MODE === 'self-signed') {
  const certPath = process.env.TUXPANEL_TLS_CERT || '/etc/tuxpanel/ssl/tuxpanel.crt';
  const keyPath = process.env.TUXPANEL_TLS_KEY || '/etc/tuxpanel/ssl/tuxpanel.key';
  
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const options = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    server = https.createServer(options, app);
    logger.info(`Starting server in HTTPS (self-signed) mode`);
  } else {
    logger.warn(`TLS mode is self-signed but certs missing. Falling back to HTTP.`);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

// IMPORTANT: Socket.io MUST attach first so its upgrade listener is registered.
initSocketIO(server);

// Initialize VNC WebSocket server
initVncProxy(server);

const vncWss = getWebSocketServer();
if (vncWss) {
  // Remove the ws-installed 'upgrade' listener that aborts non-matching paths
  if ((vncWss as any)._removeListeners) {
    (vncWss as any)._removeListeners();
  }
  // Re-add a safe upgrade listener that only handles /vnc
  server.on('upgrade', (req, socket, head) => {
    const pathname = req.url?.split('?')[0];
    if (pathname === '/vnc') {
      // Authenticate the WebSocket upgrade request via cookie
      const cookieHeader = req.headers.cookie || '';
      const user = authenticateSocket(cookieHeader);
      if (!user) {
        logger.warn(`VNC WebSocket auth failed from ${req.socket.remoteAddress}`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      logger.info(`VNC WebSocket authenticated for user '${user.sub}'`);
      vncWss.handleUpgrade(req, socket, head, (ws: any) => {
        vncWss.emit('connection', ws, req);
      });
    }
    // Non-matching paths are left alone for Socket.io
  });
}

// ── Graceful Shutdown ─────────────────────────────────────────────────
function shutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully…`);
  cleanupAllBridges();
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
  // Force exit after 10 s
  setTimeout(() => process.exit(1), 10_000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  const scheme = (server as any) instanceof https.Server ? 'https' : 'http';
  logger.info(`🐧 TuxPanel server running on ${scheme}://0.0.0.0:${PORT}`);
  logger.info(`   Environment : ${process.env.NODE_ENV || 'development'}`);
});
