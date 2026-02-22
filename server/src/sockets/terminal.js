/**
 * Terminal socket handlers — wraps node-pty to provide a full
 * interactive shell session over Socket.io.
 *
 * Events:
 *   C→S  terminal:start   { cols, rows }
 *   C→S  terminal:input   string
 *   C→S  terminal:resize  { cols, rows }
 *   S→C  terminal:output  string
 *   S→C  terminal:exit    { code }
 */

const os = require('os');
const logger = require('../utils/logger');

// node-pty is a native module — guard the require so the server can still
// start if it hasn't been compiled yet (e.g., during CI).
let pty;
try {
  pty = require('node-pty');
} catch (err) {
  logger.warn('node-pty not available — terminal feature disabled.  Run `npm rebuild node-pty`.');
}

const DEFAULT_SHELL = process.env.SHELL || '/bin/bash';

/**
 * Attach PTY lifecycle to a single socket.
 */
function attachTerminalHandlers(socket) {
  let ptyProcess = null;

  socket.on('terminal:start', ({ cols = 80, rows = 24 } = {}) => {
    if (!pty) {
      socket.emit('terminal:output', '\r\n⚠  node-pty is not installed. Terminal unavailable.\r\n');
      return;
    }

    if (ptyProcess) {
      logger.warn(`Socket ${socket.id} already has a PTY — killing old one.`);
      ptyProcess.kill();
    }

    ptyProcess = pty.spawn(DEFAULT_SHELL, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    const pid = ptyProcess.pid;
    logger.info(`PTY spawned (pid ${pid}) for socket ${socket.id}`);

    ptyProcess.onData((data) => socket.emit('terminal:output', data));

    ptyProcess.onExit(({ exitCode }) => {
      logger.info(`PTY ${pid} exited with code ${exitCode}`);
      socket.emit('terminal:exit', { code: exitCode });
      ptyProcess = null;
    });
  });

  socket.on('terminal:input', (data) => {
    if (ptyProcess) ptyProcess.write(data);
  });

  socket.on('terminal:resize', ({ cols, rows }) => {
    if (ptyProcess) {
      try {
        ptyProcess.resize(cols, rows);
      } catch (err) {
        logger.error(`PTY resize failed: ${err.message}`);
      }
    }
  });

  socket.on('disconnect', () => {
    if (ptyProcess) {
      logger.info(`Cleaning up PTY ${ptyProcess.pid} for disconnected socket ${socket.id}`);
      ptyProcess.kill();
      ptyProcess = null;
    }
  });
}

module.exports = { attachTerminalHandlers };
