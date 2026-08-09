import axios from 'axios';
import { apiBaseUrl } from './auth-storage';

const BROWSER_LOGIN_PATH = '/auth/browser-login';
const BROWSER_LOCAL_SESSION_PATH = '/auth/browser-local-session';
const BROWSER_REFRESH_PATH = '/auth/browser-refresh';
const LOGOUT_PATH = '/auth/logout';

/**
 * Browser auth endpoints accept empty/no body. Axios `post(url, null)` serializes
 * the body as the JSON literal `null`, which Nest's body-parser rejects with
 * 400 ("Unexpected token 'n', \"null\" is not valid JSON") — and login with an
 * undefined DTO can escalate to 500. Always send `{}` instead.
 */
export type BrowserAuthResponse = {
  authenticated?: boolean;
  username?: string;
};

function browserAuthConfig() {
  return {
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
    timeout: 10000
  };
}

async function requestBrowserSession(path: string): Promise<BrowserAuthResponse | null> {
  try {
    const res = await axios.post(`${apiBaseUrl()}${path}`, {}, browserAuthConfig());
    return (res.data as BrowserAuthResponse | null) ?? null;
  } catch {
    return null;
  }
}

export async function requestBrowserLogin(username: string, password: string) {
  const res = await axios.post(
    `${apiBaseUrl()}${BROWSER_LOGIN_PATH}`,
    { username, password },
    browserAuthConfig()
  );
  return res.data as BrowserAuthResponse;
}
export async function requestBrowserRefresh() {
  return requestBrowserSession(BROWSER_REFRESH_PATH);
}
export async function requestLocalAuthSession() {
  return requestBrowserSession(BROWSER_LOCAL_SESSION_PATH);
}
export async function requestLogout() {
  await requestBrowserSession(LOGOUT_PATH);
}
