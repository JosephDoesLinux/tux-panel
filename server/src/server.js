/**
 * TuxPanel — Server Entry Point
 *
 * Boots Express + Socket.io, wires middleware, mounts API routes,
 * and starts the real-time terminal namespace.
 */

require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocketIO } = require('./sockets');
const { initGuacamole, getWebSocketServer } = require('./services/guacService');
const logger = require('./utils/logger');

const PORT = parseInt(process.env.PORT, 10) || 3001;

// ── HTTP + WebSocket Server ───────────────────────────────────────────
const server = http.createServer(app);

// IMPORTANT: Socket.io MUST attach first so its upgrade listener is registered.
initSocketIO(server);

// guacamole-lite's ws.WebSocketServer attaches its own 'upgrade' listener
// to the HTTP server. The ws library aborts *all* WebSocket connections
// whose path doesn't match (e.g. /socket.io/ requests get killed).
// Fix: after init, remove ws's aggressive listener and replace with one
// that simply ignores non-matching paths instead of aborting them.
initGuacamole(server);

const guacWss = getWebSocketServer();
if (guacWss) {
  // Remove the ws-installed 'upgrade' listener that aborts non-matching paths
  if (guacWss._removeListeners) {
    guacWss._removeListeners();
  }
  // Re-add a safe upgrade listener that only handles /guacamole
  server.on('upgrade', (req, socket, head) => {
    const pathname = req.url.split('?')[0];
    if (pathname === '/guacamole') {
      guacWss.handleUpgrade(req, socket, head, (ws) => {
        guacWss.emit('connection', ws, req);
      });
    }
    // Non-matching paths are left alone for Socket.io
  });
}

// ── Graceful Shutdown ─────────────────────────────────────────────────
function shutdown(signal) {
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
