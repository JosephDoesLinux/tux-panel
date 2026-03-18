/**
 * Socket.io initialisation — real-time terminal (node-pty) and live stats.
 */

import { Server  } from 'socket.io';
import http from 'http';
import logger from '../utils/logger';
import { attachTerminalHandlers  } from './terminal';
import { authenticateSocket  } from '../middleware/auth';
import { corsOriginValidator } from '../utils/cors';

function initSocketIO(httpServer: http.Server) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOriginValidator,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Limits
    maxHttpBufferSize: 1e6, // 1 MB
    pingTimeout: 20_000,
    pingInterval: 10_000,
  });

  const authMiddleware = (socket: any, next: any) => {
    const cookieHeader = socket.handshake.headers.cookie || '';
    const user = authenticateSocket(cookieHeader);
    if (!user) {
      logger.warn(`Socket auth failed from ${socket.handshake.address}`);
      return next(new Error('Authentication required'));
    }
    socket.user = user;
    next();
  };

  // ── Namespaces ────────────────────────────────────────────────────
  // /terminal — interactive PTY shell
  const terminalNs = io.of('/terminal');
  terminalNs.use(authMiddleware);
  terminalNs.on('connection', (socket) => {
    logger.info(`Terminal socket connected: ${socket.id}`);
    attachTerminalHandlers(socket);
  });

  // /stats — live system metrics push (Phase 4)
  const statsNs = io.of('/stats');
  statsNs.use(authMiddleware);
  statsNs.on('connection', (socket) => {
    logger.info(`Stats socket connected: ${socket.id}`);
    // TODO: Phase 4 — push CPU/mem/disk stats on interval
  });

  logger.info('Socket.io initialised (namespaces: /terminal, /stats)');
  return io;
}

export {  initSocketIO  };
