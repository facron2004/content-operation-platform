const TOKEN_KEY = 'auth_token',
  USER_KEY = 'auth_user';
export const REFRESH_LEAD_MS = 5 * 60 * 1000;
export const MIN_REFRESH_INTERVAL_MS = 30 * 1000;
export const REFRESH_PATH = '/auth/refresh';
export const LOCAL_SESSION_PATH = '/auth/local-session';
export function parseJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
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
