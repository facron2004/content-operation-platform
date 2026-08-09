const TOKEN_KEY = 'auth_token',
  USER_KEY = 'auth_user';

export function readStoredAuth() {
  // Remove JWTs written by pre-cookie builds; the browser should only persist
  // the non-sensitive display identity while the HttpOnly cookie persists auth.
  localStorage.removeItem(TOKEN_KEY);
  return { username: localStorage.getItem(USER_KEY) };
}
export function writeStoredAuth(username: string) {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.setItem(USER_KEY, username);
}
export function clearStoredAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
export function apiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? '/api';
}
