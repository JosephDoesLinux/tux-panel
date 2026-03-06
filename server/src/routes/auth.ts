/**
 * Auth Routes — login, logout, session check.
 *
 * POST /api/auth/login   — Authenticate with Linux credentials
 * POST /api/auth/logout  — Clear session cookie
 * GET  /api/auth/session  — Check current session (returns user info or 401)
 */

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z  } from 'zod';
import { authenticate, signToken, verifyToken  } from '../services/authService';
import { requireAuth  } from '../middleware/auth';
import validate from '../middleware/validate';
import logger from '../utils/logger';

const router = Router();

// Strict rate limiting for login to prevent brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per `window`
  message: { error: 'Too many login attempts from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Zod schema for login
const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').regex(/^[a-z_][a-z0-9_-]{0,31}$/, 'Invalid username format'),
  password: z.string().min(1, 'Password is required'),
});

// Cookie options
const COOKIE_NAME = 'tuxpanel_session';
function cookieOptions(req: Request): any {
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
router.post('/login', loginLimiter, validate(loginSchema), async (req: Request, res: Response) => {
  const { username, password } = req.body;

  const result = await authenticate(username, password);

  if (!result.success) {
    // Rate limiting is already handled at the app level, but add a small delay
    // to mitigate brute-force timing attacks
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
    return res.status(401).json({ error: result.error });
  }

  // Sign JWT and set as httpOnly cookie
  const token = signToken(result.user!);

  res.cookie(COOKIE_NAME, token, cookieOptions(req));

  res.json({
    user: {
      username: result.user?.username,
      groups: result.user?.groups,
    },
  });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ message: 'Logged out' });
});

/**
 * GET /api/auth/session
 * Returns current user info if authenticated, 401 otherwise.
 */
router.get('/session', requireAuth, (req: Request, res: Response) => {
  res.json({
    user: {
      username: req.user?.sub,
      groups: req.user?.groups,
    },
  });
});

export default router;
