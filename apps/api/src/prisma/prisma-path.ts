import { Prisma } from '@prisma/client';
import { join, dirname, resolve } from 'path';
import { existsSync } from 'fs';
import { deepBigIntToNumber } from './prisma-bigint';
import { findRepoRootDbPath } from './prisma-db-path';
export { deepBigIntToNumber } from './prisma-bigint';
export { findRepoRootDbPath } from './prisma-db-path';
export function getPrismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
}
/** Resolve the dev.db path. If DATABASE_URL is set, use it directly (even if file doesn't exist yet). */
export function resolveDevDbPath() {
  const dbUrlPath = resolveDbUrlPath();
  if (dbUrlPath) {
    if (!existsSync(dbUrlPath)) {
      // DATABASE_URL 是相对路径（如 file:./prisma/dev.db），
      // 但 npm workspace（npm run -w）会将 CWD 切到子目录，
      // resolve("./prisma/dev.db") 走到错误路径。
      // 走目录扫描兜底 —— 向上遍历寻找 prisma/dev.db
      const repoRootDbPath =
        findRepoRootDbPath(process.cwd()) ||
        findRepoRootDbPath(__dirname) ||
        findRepoRootDbPath(dirname(process.execPath));
      if (repoRootDbPath) {
        return {
          exeDbPath: '',
          cwdDbPath: join(process.cwd(), 'prisma', 'dev.db'),
          repoRootDbPath,
          dbUrlPath,
          finalDbPath: repoRootDbPath,
          exists: true
        };
      }
    }
    return {
      exeDbPath: '',
      cwdDbPath: '',
      repoRootDbPath: null,
      dbUrlPath,
      finalDbPath: dbUrlPath,
      exists: existsSync(dbUrlPath)
    };
  }

  // Fallback: scan filesystem (production / local dev without DATABASE_URL)
  const exeDir = dirname(process.execPath),
    exeDbPath = join(exeDir, 'prisma', 'dev.db'),
    cwdDbPath = join(process.cwd(), 'prisma', 'dev.db'),
    repoRootDbPath = findRepoRootDbPath(process.cwd()),
    candidates = [exeDbPath, cwdDbPath, repoRootDbPath].filter(Boolean) as string[];
  const existing = candidates.find((p) => existsSync(p));
  return {
    exeDbPath,
    cwdDbPath,
    repoRootDbPath,
    dbUrlPath,
    finalDbPath: existing ?? cwdDbPath,
    exists: !!existing
  };
}
/** Extract a local file path from DATABASE_URL env var, if it's a file:// URL */
function resolveDbUrlPath(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const match = url.match(/^file:(?:\/\/)?(.+)$/);
  if (!match) return null;
  let filePath = match[1];
  // Handle Windows absolute paths like /C:/...
  if (/^\/[a-zA-Z]:\//.test(filePath)) filePath = filePath.slice(1);
  if (!filePath) return null;
  // Resolve relative paths to absolute for libSQL compatibility (especially on Windows)
  return resolve(filePath);
}
export const prismaJsonReplacer = (_key: string, value: unknown): unknown =>
  deepBigIntToNumber(value);
