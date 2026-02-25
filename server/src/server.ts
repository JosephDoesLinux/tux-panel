/**
 * TuxPanel — Server Entry Point
 *
 * Boots Express + Socket.io, wires middleware, mounts API routes,
 * and starts the real-time terminal namespace.
 */

import dotenv from 'dotenv';
dotenv.config();
import http from 'http';
import app from './app';
import { initSocketIO  } from './sockets';
import { initGuacamole, getWebSocketServer  } from './services/guacService';
import logger from './utils/logger';

const PORT = parseInt(process.env.PORT || '3001', 10);

// ── HTTP + WebSocket Server ───────────────────────────────────────────
const server = http.createServer(app);

// IMPORTANT: Socket.io MUST attach first so its upgrade listener is registered.
initSocketIO(server);

// Initialize Guacamole WebSocket server
initGuacamole(server);

const guacWss = getWebSocketServer();
if (guacWss) {
  // Remove the ws-installed 'upgrade' listener that aborts non-matching paths
  if (guacWss._removeListeners) {
    guacWss._removeListeners();
  }
  // Re-add a safe upgrade listener that only handles /guacamole
  server.on('upgrade', (req, socket, head) => {
    const pathname = req.url?.split('?')[0];
    if (pathname === '/guacamole') {
      guacWss.handleUpgrade(req, socket, head, (ws: any) => {
        guacWss.emit('connection', ws, req);
      });
    }
    // Non-matching paths are left alone for Socket.io
  });
}

// ── Graceful Shutdown ─────────────────────────────────────────────────
function shutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully…`);
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
  logger.info(`🐧 TuxPanel server running on http://0.0.0.0:${PORT}`);
  logger.info(`   Environment : ${process.env.NODE_ENV || 'development'}`);
});
