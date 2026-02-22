/**
 * Authentication Middleware — verifies JWT from httpOnly cookie.
 *
 * Usage:
 *   app.use('/api/system', requireAuth, systemRoutes);
 *
 * Populates req.user with { sub, uid, groups, iat, exp }.
 */

const { verifyToken } = require('../services/authService');
const logger = require('../utils/logger');

/**
 * Require a valid JWT in the 'tuxpanel_session' cookie.
 * Returns 401 if missing or invalid.
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.tuxpanel_session;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    // Clear the invalid cookie
    res.clearCookie('tuxpanel_session');
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  // Attach user info to the request
  req.user = payload;
  next();
}

/**
 * Extract user from JWT cookie for Socket.io middleware.
 * Returns the decoded token payload or null.
 *
 * @param {string} cookieHeader - Raw Cookie header string
 * @returns {object|null}
 */
function authenticateSocket(cookieHeader) {
  if (!cookieHeader) return null;

  // Parse cookies manually (avoid extra dependency for Socket.io)
  const cookies = {};
  cookieHeader.split(';').forEach((pair) => {
    const [name, ...rest] = pair.trim().split('=');
    cookies[name] = rest.join('=');
  });

  const token = cookies.tuxpanel_session;
  if (!token) return null;

  return verifyToken(token);
}

module.exports = { requireAuth, authenticateSocket };
