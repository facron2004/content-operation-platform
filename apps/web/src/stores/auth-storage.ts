const TOKEN_KEY = 'auth_token',
  USER_KEY = 'auth_user';
export const REFRESH_LEAD_MS = 5 * 60 * 1000;
export const MIN_REFRESH_INTERVAL_MS = 30 * 1000;
export const REFRESH_PATH = '/auth/refresh';
export const LOCAL_SESSION_PATH = '/auth/local-session';

/** Decode a JWT payload segment (base64url) without verifying the signature. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  // JWT uses base64url; atob expects standard base64 with padding.
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  // Cap payload segment so a multi-KB garbage token cannot thrash atob/JSON.parse.
  if (padded.length > 4096) return null;
  const json = atob(padded);
  const payload = JSON.parse(json) as unknown;
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
}

export function parseJwtExp(token: string): number | null {
  try {
    const payload = decodeJwtPayload(token);
    return typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
export function readStoredAuth() {
  return { token: localStorage.getItem(TOKEN_KEY), username: localStorage.getItem(USER_KEY) };
}
export function writeStoredAuth(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}
export function clearStoredAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
export function apiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? '/api';
}
