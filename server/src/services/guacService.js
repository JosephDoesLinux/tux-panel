/**
 * Guacamole Service — Initialises guacamole-lite as a WebSocket proxy
 * on the same HTTP server (path: /guacamole) and provides encrypted
 * connection tokens.
 *
 * Flow:
 *   1. Client calls POST /api/rdp/connect
 *   2. Server generates an encrypted token with connection params
 *   3. Client opens WebSocket to ws://host:3001/guacamole?token=<TOKEN>
 *   4. guacamole-lite decrypts token, connects to guacd, proxies session
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const CIPHER = 'AES-256-CBC';

// Key MUST be exactly 32 bytes for AES-256
function deriveKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

let guacServer = null;
let cryptKey = null;

/**
 * Initialise guacamole-lite on the given HTTP server.
 *
 * @param {import('http').Server} httpServer
 */
function initGuacamole(httpServer) {
  let GuacamoleLite;
  try {
    GuacamoleLite = require('guacamole-lite');
  } catch (err) {
    logger.warn('guacamole-lite not installed — RDP proxy disabled.');
    return null;
  }

  const secret = process.env.GUAC_SECRET || 'tuxpanel-guac-dev-secret-change-me';
  cryptKey = deriveKey(secret);

  const guacdHost = process.env.GUACD_HOST || '127.0.0.1';
  const guacdPort = parseInt(process.env.GUACD_PORT, 10) || 4822;

  try {
    guacServer = new GuacamoleLite(
      // WebSocket server options — share the HTTP server, isolate path
      { server: httpServer, path: '/guacamole' },
      // guacd connection
      { host: guacdHost, port: guacdPort },
      // Options
      {
        crypt: {
          cypher: CIPHER,
          key: cryptKey,
        },
        log: {
          level: 'DEBUG',
        },
        // Default connection settings (can be overridden per-token)
        connectionDefaultSettings: {
          rdp: {
            'security': 'any',
            'ignore-cert': true,
            'resize-method': 'display-update',
            'enable-font-smoothing': true,
            'enable-wallpaper': true,
            'enable-theming': true,
            'enable-desktop-composition': true,
            'disable-audio': false,
            'enable-drive': false,
            'create-drive-path': false,
          },
          vnc: {
            'swap-red-blue': false,
            'cursor': true,
          },
        },
      }
    );

    logger.info(`Guacamole proxy initialised (guacd @ ${guacdHost}:${guacdPort}, ws path: /guacamole)`);
    return guacServer;
  } catch (err) {
    logger.error(`Failed to initialise guacamole-lite: ${err.message}`);
    return null;
  }
}

/**
 * Generate an encrypted connection token for guacamole-lite.
 *
 * @param {object} params
 * @param {string} params.protocol  'rdp' or 'vnc'
 * @param {string} params.hostname  Target host (usually 127.0.0.1)
 * @param {number} params.port      Target port
 * @param {string} [params.username]
 * @param {string} [params.password]
 * @param {number} [params.width]
 * @param {number} [params.height]
 * @param {number} [params.dpi]
 * @returns {string} Base64-encoded encrypted token
 */
function generateToken(params) {
  if (!cryptKey) {
    throw new Error('Guacamole service not initialised');
  }

  const connectionData = {
    connection: {
      type: params.protocol || 'rdp',
      settings: {'hostname': params.hostname || '127.0.0.1',
'port': '3389',
'username': String(params.username),
'password': String(params.password),
'security': 'tls',
'ignore-cert': 'true',
'enable-gfx': 'false',
'disable-gfx': 'true',
'disable-audio': 'true',
'enable-drive': 'false',
'color-depth': '32',
'width': '1920',
'height': '1080',
'client-name': 'Guacamole'
}
    },
  };

  // Encrypt using the same cipher + key that guacamole-lite will decrypt with
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(CIPHER, cryptKey, iv);
  let encrypted = cipher.update(JSON.stringify(connectionData), 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const token = Buffer.from(
    JSON.stringify({
      iv: iv.toString('base64'),
      value: encrypted,
    })
  ).toString('base64');

  return token;
}

/**
 * Check if guacamole proxy is operational.
 */
function isReady() {
  return guacServer !== null;
}

/**
 * Get the underlying ws.WebSocketServer for manual upgrade handling.
 */
function getWebSocketServer() {
  return guacServer?.webSocketServer || null;
}

module.exports = {
  initGuacamole,
  generateToken,
  isReady,
  getWebSocketServer,
};
