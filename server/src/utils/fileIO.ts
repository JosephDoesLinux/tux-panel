/**
 * Privileged File I/O — read/write files that may require elevated permissions.
 *
 * Pattern: try fs.readFileSync first (fast, no sudo). On EACCES,
 * fall back to the editConf command runner entry which uses pkexec.
 */

import fs from 'fs';
import { run } from './commandRunner';

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
 * Write a file, falling back to sudo/pkexec if permission is denied.
 * @param filePath Absolute path to the file
 * @param content  Content to write
 */
export async function writePrivilegedFile(filePath: string, content: string): Promise<void> {
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
