import { Prisma } from '@prisma/client';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { deepBigIntToNumber } from './prisma-bigint';
import { findRepoRootDbPath } from './prisma-db-path';
export { deepBigIntToNumber } from './prisma-bigint';
export { findRepoRootDbPath } from './prisma-db-path';
export function getPrismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
}
/** Resolve the dev.db path, preferring DATABASE_URL or an existing file */
export function resolveDevDbPath() {
  // Priority 1: DATABASE_URL env var (absolute file:// path)
  const dbUrlPath = resolveDbUrlPath();
  if (dbUrlPath && existsSync(dbUrlPath)) {
    return {
      exeDbPath: '',
      cwdDbPath: '',
      repoRootDbPath: null,
      dbUrlPath,
      finalDbPath: dbUrlPath,
      exists: true
    };
  }

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
  if (!existsSync(filePath)) return null;
  return filePath;
}
export const prismaJsonReplacer = (_key: string, value: unknown): unknown =>
  deepBigIntToNumber(value);
