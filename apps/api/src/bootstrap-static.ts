import { join, dirname } from 'path';
import { existsSync } from 'fs';
import type { Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

export function resolvePublicDir(): string {
  const relativeWebDist = join(__dirname, '..', '..', 'web', 'dist');
  if (existsSync(relativeWebDist)) return relativeWebDist;
  const electronAppWebDist = join(
    dirname(process.execPath),
    'resources',
    'app',
    'apps',
    'web',
    'dist'
  );
  if (existsSync(electronAppWebDist)) return electronAppWebDist;
  const exePublic = join(dirname(process.execPath), 'public');
  if (existsSync(exePublic)) return exePublic;
  const cwdPublic = join(process.cwd(), 'public');
  if (existsSync(cwdPublic)) return cwdPublic;
  const webDist = join(process.cwd(), 'apps', 'web', 'dist');
  if (existsSync(webDist)) return webDist;
  const distPublic = join(process.cwd(), 'dist', 'public');
  if (existsSync(distPublic)) return distPublic;
  return relativeWebDist;
}

function isHashedAsset(path: string): boolean {
  // Vite/webpack hashed assets: app.abc123.js, style-def456.css
  return /\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|eot|svg|png|jpe?g|gif|webp|ico)$/i.test(path);
}

export function mountStaticSpa(
  app: {
    use: (...a: unknown[]) => void;
    get: (p: string, h: (req: Request, res: Response, next: NextFunction) => void) => void;
  },
  publicDir: string,
  express: {
    static: (
      dir: string,
      opts?: {
        setHeaders?: (res: Response, path: string) => void;
        index?: boolean | string;
        maxAge?: number | string;
      }
    ) => unknown;
  },
  logger: Logger
): void {
  if (!existsSync(publicDir)) return;
  // Hashed assets can be cached long-term; HTML / non-hashed must revalidate.
  app.use(
    express.static(publicDir, {
      index: false,
      setHeaders(res, filePath) {
        if (isHashedAsset(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    })
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/t/')
    ) {
      return next();
    }
    const indexPath = join(publicDir, 'index.html');
    if (existsSync(indexPath)) {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexPath);
    } else next();
  });
  logger.log(`Static files served from: ${publicDir}`);
}
