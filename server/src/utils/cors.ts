/**
 * Shared CORS origin validator — used by both Express and Socket.io.
 */

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

/**
 * Validates whether an origin is allowed for CORS requests.
 * Permits: configured origins, no-origin requests, and LAN origins in dev.
 */
export function corsOriginValidator(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) {
  // Allow requests with no origin (mobile apps, curl, same-origin)
  if (!origin) return callback(null, true);
  // Allow configured origins
  if (allowedOrigins.includes(origin)) return callback(null, true);
  // Allow any LAN origin (fixes Vite's crossorigin module scripts sending Origin header in prod)
  if (
    /^https?:\/\/(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin)
  ) {
    return callback(null, true);
  }
  callback(new Error('CORS not allowed'));
}
