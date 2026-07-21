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
export function resolveDevDbPath() {
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
    finalDbPath: existing ?? cwdDbPath,
    exists: !!existing
  };
}
export const prismaJsonReplacer = (_key: string, value: unknown): unknown =>
  deepBigIntToNumber(value);
