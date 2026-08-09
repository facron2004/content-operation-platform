import type { Request, Response } from 'express';

export const AUTH_COOKIE_NAME = 'content_ops_auth';

const AUTH_COOKIE_PATH = '/api';
const AUTH_COOKIE_SAME_SITE = 'SameSite=Lax';
const CLEAR_COOKIE_EXPIRES = 'Thu, 01 Jan 1970 00:00:00 GMT';

function cookieAttributes(): string[] {
  const attributes = ['HttpOnly', `Path=${AUTH_COOKIE_PATH}`, AUTH_COOKIE_SAME_SITE];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  return attributes;
}

export function setAuthCookie(res: Response, token: string): void {
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieAttributes().join('; ')}`
  );
}

export function clearAuthCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Max-Age=0; Expires=${CLEAR_COOKIE_EXPIRES}; ${cookieAttributes().join('; ')}`
  );
}

export function extractJwtFromCookie(req: Request): string | null {
  const rawCookie = req.headers.cookie;
  if (!rawCookie) return null;

  for (const part of rawCookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== AUTH_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
}
