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
const { initGuacamole } = require('./services/guacService');
const logger = require('./utils/logger');

const PORT = parseInt(process.env.PORT, 10) || 3001;

// ── HTTP + WebSocket Server ───────────────────────────────────────────
const server = http.createServer(app);
initSocketIO(server);
initGuacamole(server);

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
