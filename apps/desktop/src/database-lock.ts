import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class DatabaseLockError extends Error {
  constructor(public readonly lockPath: string) {
    super(`数据库迁移被其他进程占用: ${lockPath}`);
    this.name = 'DatabaseLockError';
  }
}

/**
 * Acquire an exclusive lock file. Unknown or malformed lock owners are kept
 * conservatively; only a lock whose recorded PID is demonstrably dead is
 * eligible for cleanup.
 */
export function acquireFileLock(lockPath: string): () => void {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const token = crypto.randomUUID();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(
        fd,
        JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() })
      );
      fs.closeSync(fd);
      return () => {
        try {
          const current = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { token?: string };
          if (current.token === token) fs.unlinkSync(lockPath);
        } catch {
          // The lock may already have been removed during process shutdown.
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt > 0) {
        throw new DatabaseLockError(lockPath);
      }

      let stale = false;
      try {
        const metadata = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid?: number };
        const pid = metadata.pid;
        if (typeof pid === 'number' && Number.isInteger(pid) && pid > 0) {
          try {
            process.kill(pid, 0);
          } catch (probeError) {
            // ESRCH proves that the owner no longer exists. EPERM and any
            // other error are intentionally treated as live/unknown.
            stale = (probeError as NodeJS.ErrnoException).code === 'ESRCH';
          }
        }
      } catch {
        // Do not delete a lock that cannot be proven stale.
      }
      if (!stale) throw new DatabaseLockError(lockPath);
      try {
        fs.unlinkSync(lockPath);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') throw unlinkError;
      }
    }
  }

  throw new DatabaseLockError(lockPath);
}
