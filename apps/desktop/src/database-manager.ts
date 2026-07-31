import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { app } from 'electron';
import {
  getDataDir,
  getDatabasePath,
  getBackupsDir,
  getMigrationsPath,
  getSchemaPath
} from './paths';
import { logInfo, logError } from './logger';

/**
 * 数据库管理器：初始化、迁移、备份
 */

function timestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}

/** 备份当前数据库 */
export function backupDatabase(reason: string): string | null {
  const dbPath = getDatabasePath();
  if (!fs.existsSync(dbPath)) return null;

  const backupsDir = getBackupsDir();
  fs.mkdirSync(backupsDir, { recursive: true });

  const backupName = `${reason}-${timestamp()}.db`;
  const backupPath = path.join(backupsDir, backupName);

  fs.copyFileSync(dbPath, backupPath);
  logInfo(`数据库已备份: ${backupPath}`);

  // 保留最近 10 份备份
  const backups = fs
    .readdirSync(backupsDir)
    .filter((f) => f.endsWith('.db'))
    .sort()
    .reverse();

  if (backups.length > 10) {
    for (const old of backups.slice(10)) {
      fs.unlinkSync(path.join(backupsDir, old));
    }
  }

  return backupPath;
}

/** 执行 Prisma 数据库迁移 */
export async function runMigrations(): Promise<void> {
  const dbPath = getDatabasePath();
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  const isFirstRun = !fs.existsSync(dbPath);

  if (!isFirstRun) {
    backupDatabase('before-migration');
  } else {
    // 首次运行：prisma migrate deploy 要求 SQLite 文件已存在，否则会报 P1003 / "Schema engine error"。
    // 0 字节文件即合法的空 SQLite 库，migrate deploy 会自动初始化表结构。
    fs.writeFileSync(dbPath, '');
    logInfo('首次运行，已创建空数据库文件');
  }

  const migrationsPath = getMigrationsPath();
  const schemaPath = getSchemaPath();

  // 打包环境下使用 prisma migrate deploy
  if (fs.existsSync(migrationsPath) && fs.existsSync(schemaPath)) {
    logInfo(`执行数据库迁移: ${migrationsPath}`);

    const normalizedDbPath = dbPath.replace(/\\/g, '/');
    const env = {
      ...process.env,
      DATABASE_URL: `file:${normalizedDbPath}`,
      ELECTRON_RUN_AS_NODE: '1'
    };

    try {
      if (app.isPackaged) {
        // 打包模式：用 Electron 自身作为 Node 运行 prisma CLI JS 入口
        const prismaCliJs = path.join(
          process.resourcesPath,
          'api',
          'node_modules',
          'prisma',
          'build',
          'index.js'
        );
        execFileSync(process.execPath, [prismaCliJs, 'migrate', 'deploy', '--schema', schemaPath], {
          env,
          stdio: 'pipe',
          timeout: 60_000
        });
      } else {
        // 开发模式：直接调用 node_modules/.bin/prisma
        const prismaBin = path.resolve(
          app.getAppPath(),
          '..',
          '..',
          'node_modules',
          '.bin',
          'prisma.cmd'
        );
        execFileSync(prismaBin, ['migrate', 'deploy', '--schema', schemaPath], {
          env,
          stdio: 'pipe',
          timeout: 60_000,
          shell: true
        });
      }
      logInfo('数据库迁移完成');
    } catch (err) {
      logError('数据库迁移失败', err);
      throw new Error(`数据库迁移失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    logInfo('未找到 migrations 目录，跳过迁移（首次运行将由应用自动建表）');
  }
}

/** 初始化数据库（完整流程） */
export async function initializeDatabase(): Promise<void> {
  logInfo('初始化数据库...');
  await runMigrations();
  logInfo('数据库初始化完成');
}
