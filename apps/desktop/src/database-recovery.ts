import fs from 'node:fs';
import path from 'node:path';

/** Find an old database left behind by an interrupted atomic migration. */
export function findInterruptedMigrationBackup(
  dataDir: string,
  databasePath: string
): string | null {
  if (!fs.existsSync(dataDir)) return null;
  const prefix = `${path.basename(databasePath)}.`;
  const candidates = fs
    .readdirSync(dataDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith('.previous')
    )
    .map((entry) => {
      const fullPath = path.join(dataDir, entry.name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.fullPath ?? null;
}

/** Restore only when the target is missing; never replace a live/current database. */
export function restoreInterruptedMigrationBackup(
  dataDir: string,
  databasePath: string
): string | null {
  if (fs.existsSync(databasePath)) return null;
  const backupPath = findInterruptedMigrationBackup(dataDir, databasePath);
  if (!backupPath) return null;

  try {
    fs.renameSync(backupPath, databasePath);
    for (const suffix of ['-wal', '-shm']) {
      const backupSidecar = `${backupPath}${suffix}`;
      const targetSidecar = `${databasePath}${suffix}`;
      if (fs.existsSync(backupSidecar) && !fs.existsSync(targetSidecar)) {
        fs.renameSync(backupSidecar, targetSidecar);
      }
    }
    return backupPath;
  } catch (error) {
    throw new Error(
      `迁移中断后的旧数据库恢复失败: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
