import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const DESKTOP_RUNTIME_COOKIE_NAME = 'desktop_runtime_token';

export function requireDesktopRuntimeToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.DESKTOP_RUNTIME_TOKEN?.trim();
  if (!token) {
    throw new Error('DESKTOP_RUNTIME_TOKEN is required when APP_RUNTIME=desktop');
  }
  return token;
}

function readCookie(req: Request, name: string): string | undefined {
  const prefix = `${name}=`;
  const cookie = (req.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie?.slice(prefix.length);
}

function equalToken(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function createDesktopTokenGuard(expectedToken: string): RequestHandler {
  if (!expectedToken) throw new Error('Desktop runtime token must not be empty');
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path === '/health' || req.path === '/ready') return next();
    if (!equalToken(readCookie(req, DESKTOP_RUNTIME_COOKIE_NAME), expectedToken)) {
      res.status(403).json({ message: 'Forbidden: invalid desktop runtime token' });
      return;
    }
    next();
  };
}
