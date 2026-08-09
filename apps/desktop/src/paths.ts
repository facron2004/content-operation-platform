import { app } from 'electron';
import path from 'node:path';
import { resolveDesktopDatabasePath } from './path-helpers';

/**
 * 统一路径管理：区分开发环境和打包环境
 */

export function isPackaged(): boolean {
  return app.isPackaged;
}

/** 用户数据根目录 (AppData/Roaming/内容运营中台) */
export function getUserDataPath(): string {
  return app.getPath('userData');
}

/** 数据库文件目录 */
export function getDataDir(): string {
  return path.join(getUserDataPath(), 'data');
}

/** 跨进程数据库迁移锁 */
export function getMigrationLockPath(): string {
  return path.join(getDataDir(), 'migration.lock');
}

/** 可由升级器或人工选择传入的旧数据库候选路径。 */
export function getLegacyDatabaseCandidates(): string[] {
  const candidates: string[] = [];
  const configured = process.env.CONTENT_OPS_LEGACY_DATABASE_PATH?.trim();
  if (configured) candidates.push(path.resolve(configured));

  // 开发环境兼容曾经使用项目库的桌面版本；打包态不再猜测源码路径。
  if (!app.isPackaged) {
    candidates.push(path.resolve(app.getAppPath(), '..', '..', 'prisma', 'dev.db'));
  }

  const databasePath = path.resolve(getDatabasePath());
  return [...new Set(candidates)].filter((candidate) => path.resolve(candidate) !== databasePath);
}

/** 数据库文件路径 */
export function getDatabasePath(): string {
  // 桌面端永远使用用户目录数据库，不能读取源码目录中的开发库。
  return resolveDesktopDatabasePath(getUserDataPath());
}

/** 备份目录 */
export function getBackupsDir(): string {
  return path.join(getUserDataPath(), 'backups');
}

/** 日志目录 */
export function getLogsDir(): string {
  return path.join(getUserDataPath(), 'logs');
}

/** NestJS 入口文件 */
export function getApiEntry(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'api', 'dist', 'main.js');
  }
  return path.resolve(app.getAppPath(), '..', 'api', 'dist', 'main.js');
}

/** Vue 静态文件目录 */
export function getWebDistPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'web');
  }
  return path.resolve(app.getAppPath(), '..', 'web', 'dist');
}

/** Prisma migrations 目录 */
export function getMigrationsPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'prisma', 'migrations');
  }
  return path.resolve(app.getAppPath(), '..', '..', 'prisma', 'migrations');
}

/** Prisma schema 路径 */
export function getSchemaPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'prisma', 'schema.prisma');
  }
  return path.resolve(app.getAppPath(), '..', '..', 'prisma', 'schema.prisma');
}

/** ReleaseManifest 路径 */
export function getReleaseManifestPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'release-manifest.json');
  }
  return path.resolve(app.getAppPath(), '..', '..', 'release-manifest.json');
}

/** resources 目录（loading.html 等） */
export function getResourcesDir(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.resolve(app.getAppPath(), '..', '..', 'resources');
}
