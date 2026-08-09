import path from 'node:path';

/** Resolve the database location owned by the current desktop installation. */
export function resolveDesktopDatabasePath(userDataPath: string): string {
  return path.join(userDataPath, 'data', 'content-operations.db');
}
