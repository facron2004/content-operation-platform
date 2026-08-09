import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { app } from 'electron';
import {
  getBackupsDir,
  getDataDir,
  getDatabasePath,
  getLegacyDatabaseCandidates,
  getMigrationLockPath,
  getMigrationsPath,
  getSchemaPath
} from './paths';
import {
  createConsistentSnapshot,
  inspectDatabase,
  waitForSnapshotRelease,
  type DatabaseInspection,
  type SqliteClientFactory
} from './database-transfer';
import { logError, logInfo } from './logger';
import { acquireFileLock, DatabaseLockError } from './database-lock';
import { applySqliteMigrations } from './database-migrations';
import { restoreInterruptedMigrationBackup } from './database-recovery';

/** 数据库管理器：一致性快照、迁移、备份和跨进程锁 */

export type DatabaseInitializationErrorCode =
  | 'MIGRATION_LOCKED'
  | 'LEGACY_DATABASE_REQUIRED'
  | 'LEGACY_IMPORT_FAILED'
  | 'DATABASE_CORRUPT'
  | 'MIGRATION_FAILED';

export class DatabaseInitializationError extends Error {
  constructor(
    public readonly code: DatabaseInitializationErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'DatabaseInitializationError';
  }
}

export type DatabaseInitializationOptions = {
  /** 首次运行时由用户选择的旧库；只接受一个明确路径。 */
  legacyDatabasePath?: string;
  /** 用户明确选择新建数据库时为 true。 */
  createNew?: boolean;
  /** 打包版首次运行时，未选择旧库前不允许静默新建。 */
  requireLegacyChoice?: boolean;
};

function timestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function createSqliteClientFactory(): SqliteClientFactory {
  const modulePath = app.isPackaged
    ? path.join(process.resourcesPath, 'api', 'node_modules', '@libsql', 'client')
    : path.resolve(app.getAppPath(), '..', '..', 'node_modules', '@libsql', 'client');
  const { createClient } = require(modulePath) as {
    createClient: (options: { url: string }) => {
      execute: (statement: string | { sql: string; args?: unknown[] }) => Promise<{
        rows?: Record<string, unknown>[];
      }>;
      executeMultiple: (sql: string) => Promise<unknown>;
      close: () => void;
    };
  };

  return (databasePath) => {
    const client = createClient({ url: `file:${normalizePath(databasePath)}` });
    return {
      execute: (sql) => client.execute(sql),
      executeMultiple: (sql) => client.executeMultiple(sql),
      close: () => client.close()
    };
  };
}

function getMigrationNames(): string[] {
  return fs
    .readdirSync(getMigrationsPath(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function acquireMigrationLock(): () => void {
  const lockPath = getMigrationLockPath();
  try {
    const release = acquireFileLock(lockPath);
    logInfo(`已取得数据库迁移锁: ${lockPath}`);
    return release;
  } catch (error) {
    if (error instanceof DatabaseLockError) {
      throw new DatabaseInitializationError('MIGRATION_LOCKED', error.message, { cause: error });
    }
    throw error;
  }
}

function createBackupPath(reason: string): string {
  fs.mkdirSync(getBackupsDir(), { recursive: true });
  return path.join(getBackupsDir(), `${reason}-${timestamp()}-${crypto.randomUUID()}.db`);
}

function pruneBackups(): void {
  const backups = fs
    .readdirSync(getBackupsDir())
    .filter((file) => file.endsWith('.db'))
    .sort()
    .reverse();
  for (const old of backups.slice(10)) fs.unlinkSync(path.join(getBackupsDir(), old));
}

/** 使用 VACUUM INTO 生成一致性备份，不直接复制可能带 WAL 的主文件。 */
export async function backupDatabase(reason: string): Promise<string | null> {
  const dbPath = getDatabasePath();
  if (!fs.existsSync(dbPath)) return null;

  const backupPath = createBackupPath(reason);
  await createConsistentSnapshot(dbPath, backupPath, createSqliteClientFactory());
  pruneBackups();
  logInfo(`数据库已生成一致性备份: ${backupPath}`);
  return backupPath;
}

function assertKeyTableCounts(before: DatabaseInspection, after: DatabaseInspection): void {
  for (const [table, count] of Object.entries(before.tableCounts)) {
    if (table === '_prisma_migrations' || count === null) continue;
    if (after.tableCounts[table] !== count) {
      throw new Error(
        `旧库导入校验失败：${table} 行数由 ${count} 变为 ${after.tableCounts[table]}`
      );
    }
  }
}

function assertMigrationHistory(inspection: DatabaseInspection): void {
  const expected = getMigrationNames();
  const applied = inspection.migrations
    .filter((row) => row.finished_at != null && row.rolled_back_at == null)
    .map((row) => String(row.migration_name))
    .sort();
  if (JSON.stringify(expected) !== JSON.stringify(applied)) {
    throw new Error(
      `迁移历史校验失败：期望 ${expected.join(', ')}，实际 ${applied.join(', ') || '空'}`
    );
  }
}

async function runSqliteMigrations(databasePath: string): Promise<void> {
  try {
    await applySqliteMigrations(
      databasePath,
      getMigrationsPath(),
      getSchemaPath(),
      createSqliteClientFactory()
    );
  } catch (error) {
    logError('数据库迁移失败', error);
    throw new Error(`数据库迁移失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function removeTemporaryDatabaseFiles(databasePath: string): void {
  for (const filePath of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
      logError(`临时数据库文件清理失败: ${filePath}`, error);
    }
  }
}

function moveDatabaseSidecars(sourcePath: string, targetPath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const sourceSidecar = `${sourcePath}${suffix}`;
    const targetSidecar = `${targetPath}${suffix}`;
    if (!fs.existsSync(sourceSidecar)) continue;
    if (fs.existsSync(targetSidecar)) {
      throw new Error(`数据库临时文件目标已存在: ${targetSidecar}`);
    }
    fs.renameSync(sourceSidecar, targetSidecar);
  }
}

async function importLegacyDatabase(sourcePath: string, targetPath: string): Promise<void> {
  const dataDir = getDataDir();
  const temporaryPath = path.join(
    dataDir,
    `.content-operations-import-${Date.now()}-${crypto.randomUUID()}.db`
  );
  const finalizedPath = `${temporaryPath}.snapshot`;
  const clientFactory = createSqliteClientFactory();

  try {
    await backupDatabaseFromPath(sourcePath, 'before-import', clientFactory);
    await createConsistentSnapshot(sourcePath, temporaryPath, clientFactory);
    const before = await inspectDatabase(temporaryPath, clientFactory);
    if (!before.integrityOk) throw new Error('旧库一致性检查失败');

    await runSqliteMigrations(temporaryPath);
    await createConsistentSnapshot(temporaryPath, finalizedPath, clientFactory);
    const after = await inspectDatabase(finalizedPath, clientFactory);
    if (!after.integrityOk) throw new Error('迁移后数据库一致性检查失败');
    assertKeyTableCounts(before, after);
    assertMigrationHistory(after);

    await waitForSnapshotRelease(finalizedPath);
    if (fs.existsSync(targetPath)) throw new Error(`目标数据库已被其他进程创建: ${targetPath}`);
    fs.renameSync(finalizedPath, targetPath);
    removeTemporaryDatabaseFiles(temporaryPath);
    logInfo(`旧数据库已原子导入: ${sourcePath} -> ${targetPath}`);
  } catch (error) {
    logError('旧数据库导入失败，原库保持不变', error);
    throw new DatabaseInitializationError(
      'LEGACY_IMPORT_FAILED',
      `旧数据库导入失败（临时库保留，可重试）: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

async function backupDatabaseFromPath(
  sourcePath: string,
  reason: string,
  clientFactory: SqliteClientFactory
): Promise<string> {
  const backupPath = createBackupPath(reason);
  await createConsistentSnapshot(sourcePath, backupPath, clientFactory);
  pruneBackups();
  logInfo(`旧数据库已生成导入前备份: ${backupPath}`);
  return backupPath;
}

async function migrateExistingDatabase(dbPath: string): Promise<void> {
  const dataDir = getDataDir();
  const temporaryPath = path.join(
    dataDir,
    `.content-operations-migrate-${Date.now()}-${crypto.randomUUID()}.db`
  );
  const finalizedPath = `${temporaryPath}.snapshot`;
  const previousPath = `${dbPath}.${crypto.randomUUID()}.previous`;
  const clientFactory = createSqliteClientFactory();

  try {
    await backupDatabase('before-migration');
    await createConsistentSnapshot(dbPath, temporaryPath, clientFactory);
    const before = await inspectDatabase(temporaryPath, clientFactory);
    if (!before.integrityOk) throw new Error('当前数据库一致性检查失败');

    await runSqliteMigrations(temporaryPath);
    await createConsistentSnapshot(temporaryPath, finalizedPath, clientFactory);
    const after = await inspectDatabase(finalizedPath, clientFactory);
    if (!after.integrityOk) throw new Error('迁移后数据库一致性检查失败');
    assertKeyTableCounts(before, after);
    assertMigrationHistory(after);

    await waitForSnapshotRelease(finalizedPath);
    fs.renameSync(dbPath, previousPath);
    try {
      moveDatabaseSidecars(dbPath, previousPath);
      fs.renameSync(finalizedPath, dbPath);
    } catch (error) {
      try {
        if (!fs.existsSync(dbPath) && fs.existsSync(previousPath)) {
          fs.renameSync(previousPath, dbPath);
          moveDatabaseSidecars(previousPath, dbPath);
        }
      } catch (restoreError) {
        logError('数据库原子切换失败且原库恢复失败', restoreError);
      }
      throw error;
    }
    removeTemporaryDatabaseFiles(temporaryPath);
    removeTemporaryDatabaseFiles(previousPath);
    logInfo(`数据库已在一致性快照上完成迁移: ${dbPath}`);
  } catch (error) {
    logError('数据库迁移失败，原库保持不变', error);
    throw new DatabaseInitializationError(
      'MIGRATION_FAILED',
      `数据库迁移失败（临时库保留，可重试）: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

async function createNewDatabase(dbPath: string): Promise<void> {
  const temporaryPath = `${dbPath}.${crypto.randomUUID()}.new`;
  const finalizedPath = `${temporaryPath}.snapshot`;
  fs.writeFileSync(temporaryPath, '');
  await runSqliteMigrations(temporaryPath);
  await createConsistentSnapshot(temporaryPath, finalizedPath, createSqliteClientFactory());
  if (fs.existsSync(dbPath)) throw new Error(`目标数据库已被其他进程创建: ${dbPath}`);
  fs.renameSync(finalizedPath, dbPath);
  removeTemporaryDatabaseFiles(temporaryPath);
  logInfo('未检测到旧数据库，已创建新的用户目录数据库');
}

async function runMigrationsLocked(options: DatabaseInitializationOptions): Promise<void> {
  const dbPath = getDatabasePath();
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  const restoredBackup = restoreInterruptedMigrationBackup(dataDir, dbPath);
  if (restoredBackup) {
    logInfo(`检测到上次迁移中断，已恢复旧数据库快照: ${restoredBackup}`);
  }

  if (fs.existsSync(dbPath)) {
    await migrateExistingDatabase(dbPath);
    return;
  }

  const configuredLegacyPath = options.legacyDatabasePath?.trim();
  const legacyCandidates = configuredLegacyPath
    ? [path.resolve(configuredLegacyPath)]
    : getLegacyDatabaseCandidates();
  const legacyPath = legacyCandidates.find((candidate) => fs.existsSync(candidate));
  if (legacyPath) {
    await importLegacyDatabase(legacyPath, dbPath);
    return;
  }

  if (configuredLegacyPath) {
    throw new DatabaseInitializationError(
      'LEGACY_IMPORT_FAILED',
      `选择的旧数据库不存在: ${configuredLegacyPath}`
    );
  }
  if (options.requireLegacyChoice && !options.createNew) {
    throw new DatabaseInitializationError(
      'LEGACY_DATABASE_REQUIRED',
      '未检测到用户目录数据库。请选择要导入的旧数据库，或明确选择新建数据库。'
    );
  }

  await createNewDatabase(dbPath);
}

/** 执行数据库迁移；同一用户目录内跨进程只允许一个迁移者。 */
export async function runMigrations(options: DatabaseInitializationOptions = {}): Promise<void> {
  let releaseLock: () => void = () => undefined;
  try {
    releaseLock = acquireMigrationLock();
    await runMigrationsLocked(options);
    logInfo('数据库迁移完成');
  } catch (error) {
    if (error instanceof DatabaseInitializationError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const code: DatabaseInitializationErrorCode =
      /integrity|malformed|not a database|corrupt/i.test(message)
        ? 'DATABASE_CORRUPT'
        : /数据库迁移被其他进程占用/.test(message)
          ? 'MIGRATION_LOCKED'
          : 'MIGRATION_FAILED';
    throw new DatabaseInitializationError(code, message, { cause: error });
  } finally {
    releaseLock();
  }
}

/** 初始化数据库（完整流程） */
export async function initializeDatabase(
  options: DatabaseInitializationOptions = {}
): Promise<void> {
  logInfo('初始化数据库...');
  await runMigrations(options);
  logInfo('数据库初始化完成');
}
