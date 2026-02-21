/**
 * Socket.io initialisation — real-time terminal (node-pty) and live stats.
 */

const { Server } = require('socket.io');
const logger = require('../utils/logger');
const { attachTerminalHandlers } = require('./terminal');

/**
 * @param {import('http').Server} httpServer
 */
function initSocketIO(httpServer) {
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Limits
    maxHttpBufferSize: 1e6, // 1 MB
    pingTimeout: 20_000,
    pingInterval: 10_000,
  });

  // ── Namespaces ────────────────────────────────────────────────────
  // /terminal — interactive PTY shell
  const terminalNs = io.of('/terminal');
  terminalNs.on('connection', (socket) => {
    logger.info(`Terminal socket connected: ${socket.id}`);
    attachTerminalHandlers(socket);
  });

  // /stats — live system metrics push (Phase 4)
  const statsNs = io.of('/stats');
  statsNs.on('connection', (socket) => {
    logger.info(`Stats socket connected: ${socket.id}`);
    // TODO: Phase 4 — push CPU/mem/disk stats on interval
  });

  logger.info('Socket.io initialised (namespaces: /terminal, /stats)');
  return io;
}

module.exports = { initSocketIO };
