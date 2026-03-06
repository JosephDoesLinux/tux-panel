/**
 * Shared utility functions used across multiple pages.
 */

/**
 * Format a byte count into a human-readable string (B, KB, MB, GB, TB).
 * @param {number|string} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (num === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(num) / Math.log(1024));
  return `${(num / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Format a bytes-per-second value into a human-readable rate string.
 * @param {number} bytesPerSec
 * @returns {string}
 */
export function formatRate(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec < 0) return '0 B/s';
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1048576) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`;
}
