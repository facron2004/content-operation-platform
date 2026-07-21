import { join, dirname } from 'path';
import { existsSync } from 'fs';
export function findRepoRootDbPath(startDir: string): string | null {
  let dir: string | null = startDir;
  for (let i = 0; i < 10 && dir; i++) {
    const candidate = join(dir, 'prisma', 'dev.db');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
