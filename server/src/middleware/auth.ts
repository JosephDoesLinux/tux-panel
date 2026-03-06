/**
 * Authentication Middleware — verifies JWT from httpOnly cookie.
 *
 * Usage:
 *   app.use('/api/system', requireAuth, systemRoutes);
 *
 * Populates req.user with { sub, uid, groups, iat, exp }.
 */

import { verifyToken  } from '../services/authService';
import logger from '../utils/logger';
import { Request, Response, NextFunction } from 'express';

/**
 * Require a valid JWT in the 'tuxpanel_session' cookie.
 * Returns 401 if missing or invalid.
 */
function requireAuth(req: Request, res: Response, next: NextFunction) {
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
function authenticateSocket(cookieHeader: string) {
  if (!cookieHeader) return null;

  // Parse cookies manually (avoid extra dependency for Socket.io)
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((pair) => {
    const [name, ...rest] = pair.trim().split('=');
    cookies[name] = rest.join('=');
  });

  const token = cookies.tuxpanel_session;
  if (!token) return null;

  return verifyToken(token);
}

export {  requireAuth, authenticateSocket  };
