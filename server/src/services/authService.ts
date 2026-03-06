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
          reject(new Error('PAM authentication failed'));
        } else {
          resolve();
        }
      }, { serviceName: 'tuxpanel', remoteHost: 'localhost' });
    } catch (loadErr) {
      // authenticate-pam not available — fall back to subprocess
      logger.warn('authenticate-pam not available, trying fallback auth');
      pamAuthenticateFallback(username, password).then(resolve).catch(reject);
    }
  });
}

/**
 * Fallback: use Python3 + pam module for authentication.
 * Most Fedora systems have python3-pam or python3-python-pam installed.
 */
function pamAuthenticateFallback(username: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', [
      '-c',
      `
import sys, ctypes, ctypes.util

# Load libpam
_libpam = ctypes.CDLL(ctypes.util.find_library("pam"))

# PAM conversation callback type
CONV_FUNC = ctypes.CFUNCTYPE(
    ctypes.c_int,
    ctypes.c_int,
    ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p)),
    ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p)),
    ctypes.c_void_p,
)

class PamConv(ctypes.Structure):
    _fields_ = [("conv", CONV_FUNC), ("appdata_ptr", ctypes.c_void_p)]

class PamResponse(ctypes.Structure):
    _fields_ = [("resp", ctypes.c_char_p), ("resp_retcode", ctypes.c_int)]

password = sys.stdin.read().strip().encode()

def conv_func(num_msg, msg, resp, appdata):
    response = PamResponse()
    response.resp = ctypes.create_string_buffer(password).value
    response.resp_retcode = 0
    resp_array = (PamResponse * 1)(response)
    resp[0] = ctypes.cast(resp_array, ctypes.POINTER(ctypes.c_void_p))
    return 0

conv = PamConv(CONV_FUNC(conv_func), None)
handle = ctypes.c_void_p()
retval = _libpam.pam_start(b"tuxpanel", sys.argv[1].encode(), ctypes.byref(conv), ctypes.byref(handle))
if retval != 0:
    sys.exit(1)
retval = _libpam.pam_authenticate(handle, 0)
_libpam.pam_end(handle, retval)
sys.exit(0 if retval == 0 else 1)
`,
      username,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    py.stdin.write(password);
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
      reject(new Error(`Cannot spawn python3: ${err.message}`));
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
