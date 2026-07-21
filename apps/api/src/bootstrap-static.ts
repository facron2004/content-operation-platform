import { join, dirname } from 'path';
import { existsSync } from 'fs';
import type { Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
export function resolvePublicDir(): string {
  const exePublic = join(dirname(process.execPath), 'public');
  if (existsSync(exePublic)) return exePublic;
  const cwdPublic = join(process.cwd(), 'apps', 'api', 'dist', 'public');
  return existsSync(cwdPublic) ? cwdPublic : join(process.cwd(), 'public');
}
export function mountStaticSpa(
  app: {
    use: (...a: unknown[]) => void;
    get: (p: string, h: (req: Request, res: Response, next: NextFunction) => void) => void;
  },
  publicDir: string,
  express: { static: (dir: string) => unknown },
  logger: Logger
): void {
  if (!existsSync(publicDir)) return;
  app.use(express.static(publicDir));
  app.get('*splat', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) return next();
    const indexPath = join(publicDir, 'index.html');
    if (existsSync(indexPath)) res.sendFile(indexPath);
    else next();
  });
  logger.log(`Static files served from: ${publicDir}`);
}
