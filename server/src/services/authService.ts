/**
 * Authentication Service — PAM-based Linux credential validation
 * with tuxpanel group membership check.
 *
 * Flow:
 *   1. User submits username + password
 *   2. PAM validates credentials against system (pam_unix → unix_chkpwd)
 *   3. Check that user belongs to the 'tuxpanel' group
 *   4. Issue a signed JWT stored in an httpOnly cookie
 *
 * NOTE: PAM authentication does NOT require root — pam_unix.so
 * internally uses the setuid unix_chkpwd helper to verify passwords
 * against /etc/shadow.
 */

import { execFileSync, spawn } from 'child_process';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

/** Represents a TuxPanel user after successful authentication. */
export interface TuxUser {
  username: string;
  uid: number;
  groups: string[];
}

/** JWT payload stored in session tokens. */
export interface JwtPayload {
  sub: string;
  uid: number;
  groups: string[];
  iat: number;
  exp: number;
}

const REQUIRED_GROUP = process.env.TUXPANEL_GROUP || 'tuxpanel';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '8h';

// Enforce a persistent JWT secret in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  logger.error('CRITICAL: JWT_SECRET is not set in production. Refusing to start.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

if (!process.env.JWT_SECRET) {
  logger.warn('JWT_SECRET not set — using random secret (sessions lost on restart)');
}

/**
 * Authenticate a user via PAM and verify tuxpanel group membership.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
async function authenticate(username: string, password: string): Promise<{success: boolean, user?: TuxUser, error?: string}> {
  // Basic input validation
  if (!username || !password) {
    return { success: false, error: 'Username and password are required' };
  }

  // Sanitise username — only allow valid Linux usernames
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(username)) {
    return { success: false, error: 'Invalid username format' };
  }

  try {
    // Step 1: Verify PAM credentials
    await pamAuthenticate(username, password);
  } catch (err: any) {
    logger.warn(`Auth failed for '${username}': ${err.message}`);
    return { success: false, error: 'Invalid username or password' };
  }

  // Step 2: Check group membership
  const groups = getUserGroups(username);
  if (!groups.includes(REQUIRED_GROUP)) {
    logger.warn(`Auth denied for '${username}': not in '${REQUIRED_GROUP}' group`);
    return {
      success: false,
      error: `User '${username}' is not authorised for TuxPanel (not in '${REQUIRED_GROUP}' group)`,
    };
  }

  // Step 3: Build user object
  const user = {
    username,
    groups,
    uid: getUserUid(username),
  };

  logger.info(`Auth success for '${username}' (groups: ${groups.join(', ')})`);
  return { success: true, user };
}

/**
 * PAM authentication via the authenticate-pam native module.
 * Falls back to a subprocess approach if the native module isn't available.
 */
function pamAuthenticate(username: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const pam = require('authenticate-pam');
      pam.authenticate(username, password, (err: any) => {
        if (err) {
          logger.warn(`authenticate-pam failed (likely due to unprivileged node process), trying wrapper fallback. Error: ${err}`);
          pamAuthenticateFallback(username, password).then(resolve).catch(reject);
        } else {
          resolve();
        }
      }, { serviceName: 'login', remoteHost: 'localhost' });
    } catch (loadErr) {
      // authenticate-pam not available — fall back to subprocess
      logger.warn('authenticate-pam not available, trying fallback auth');
      pamAuthenticateFallback(username, password).then(resolve).catch(reject);
    }
  });
}

/**
 * Fallback: use pkexec so python runs as root, bypassing unprivileged pam restrictions.
 */
function pamAuthenticateFallback(username: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const py = spawn('pkexec', [
      '/opt/tuxpanel/scripts/tuxpanel-priv-wrapper.sh',
      'auth',
      username,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    py.stdin.write(password + '\n');
    py.stdin.end();

    let stderr = '';
    py.stderr.on('data', (d) => { stderr += d.toString(); });

    py.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`PAM fallback failed (code ${code}): ${stderr.trim()}`));
      }
    });

    py.on('error', (err) => {
      reject(new Error(`Cannot spawn pkexec helper: ${err.message}`));
    });
  });
}

/**
 * Get the groups a user belongs to by reading /etc/group.
 */
function getUserGroups(username: string): string[] {
  try {
    const output = execFileSync('/usr/bin/id', ['-Gn', username], {
      encoding: 'utf8',
      timeout: 5000,
    });
    return output.trim().split(/\s+/);
  } catch {
    return [];
  }
}

/**
 * Get a user's UID.
 */
function getUserUid(username: string): number {
  try {
    const output = execFileSync('/usr/bin/id', ['-u', username], {
      encoding: 'utf8',
      timeout: 5000,
    });
    return parseInt(output.trim(), 10);
  } catch {
    return -1;
  }
}

/**
 * Sign a JWT for an authenticated user.
 */
function signToken(user: TuxUser): string {
  return jwt.sign(
    {
      sub: user.username,
      uid: user.uid,
      groups: user.groups,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY as any }
  );
}

/**
 * Verify and decode a JWT.
 * @returns {object|null} Decoded payload or null
 */
function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export { 
  authenticate,
  signToken,
  verifyToken,
  REQUIRED_GROUP,
 };
