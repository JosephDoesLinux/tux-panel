/**
 * Privileged File I/O — read/write files that may require elevated permissions.
 *
 * Pattern: try fs.readFileSync first (fast, no sudo). On EACCES,
 * fall back to the editConf command runner entry which uses pkexec.
 */

import fs from 'fs';
import { run } from './commandRunner';
import logger from './logger';

/**
 * Read a file, falling back to sudo/pkexec if permission is denied.
 * @param filePath Absolute path to the file
 * @returns File contents as a string
 */
export async function readPrivilegedFile(filePath: string): Promise<string> {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err: any) {
    if (err.code === 'EACCES') {
      const r = await run('editConf', ['read', filePath]);
      return r.stdout;
    }
    throw err;
  }
}

/**
 * Write a file, creating a .bak backup first.
 * Falls back to sudo/pkexec if permission is denied.
 * @param filePath Absolute path to the file
 * @param content  Content to write
 */
export async function writePrivilegedFile(filePath: string, content: string): Promise<void> {
  // Create a .bak backup of the existing file before overwriting
  try {
    if (fs.existsSync(filePath)) {
      const backup = `${filePath}.bak`;
      try {
        fs.copyFileSync(filePath, backup);
        logger.info(`Backup created: ${backup}`);
      } catch {
        // If direct copy fails (EACCES), try reading via privilege escalation
        try {
          const existing = await readPrivilegedFile(filePath);
          await run('editConf', ['write', backup], { stdin: existing });
          logger.info(`Backup created (elevated): ${backup}`);
        } catch (backupErr: any) {
          logger.warn(`Could not create backup of ${filePath}: ${backupErr.message}`);
        }
      }
    }
  } catch {
    // Non-fatal: if backup fails, still proceed with the write
  }

  try {
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (err: any) {
    if (err.code === 'EACCES') {
      await run('editConf', ['write', filePath], { stdin: content });
    } else {
      throw err;
    }
  }
}
