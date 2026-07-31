import { app } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';

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

/** 数据库文件路径 */
export function getDatabasePath(): string {
  if (app.isPackaged) {
    // 打包态优先复用项目里的开发库（含真实数据），避免另建孤立空库
    const projectDevDb = 'E:/Program/Content Operation Platform/prisma/dev.db';
    if (existsSync(projectDevDb)) {
      return projectDevDb;
    }
  }
  return path.join(getDataDir(), 'content-operations.db');
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

/** resources 目录（loading.html 等） */
export function getResourcesDir(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.resolve(app.getAppPath(), '..', '..', 'resources');
}
