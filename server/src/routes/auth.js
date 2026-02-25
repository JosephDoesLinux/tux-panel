/**
 * Auth Routes — login, logout, session check.
 *
 * POST /api/auth/login   — Authenticate with Linux credentials
 * POST /api/auth/logout  — Clear session cookie
 * GET  /api/auth/session  — Check current session (returns user info or 401)
 */

const { Router } = require('express');
const { authenticate, signToken, verifyToken, removePassword } = require('../services/authService');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = Router();

// Cookie options
const COOKIE_NAME = 'tuxpanel_session';
function cookieOptions(req) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,                          // Not accessible from JS (XSS protection)
    secure: isProd,                          // HTTPS only in production
    sameSite: isProd ? 'strict' : 'lax',     // CSRF protection
    maxAge: 8 * 60 * 60 * 1000,              // 8 hours
    path: '/',
  };
}

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const result = await authenticate(username, password);

  if (!result.success) {
    // Rate limiting is already handled at the app level, but add a small delay
    // to mitigate brute-force timing attacks
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
    return res.status(401).json({ error: result.error });
  }

  // Sign JWT and set as httpOnly cookie
  const token = signToken(result.user);

  res.cookie(COOKIE_NAME, token, cookieOptions(req));

  res.json({
    user: {
      username: result.user.username,
      groups: result.user.groups,
    },
  });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  const token = req.cookies?.tuxpanel_session;
  if (token) {
    const payload = verifyToken(token);
    if (payload?.sub) {
      removePassword(payload.sub);
    }
  }
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ message: 'Logged out' });
});

/**
 * GET /api/auth/session
 * Returns current user info if authenticated, 401 otherwise.
 */
router.get('/session', requireAuth, (req, res) => {
  res.json({
    user: {
      username: req.user.sub,
      groups: req.user.groups,
    },
  });
});

module.exports = router;
