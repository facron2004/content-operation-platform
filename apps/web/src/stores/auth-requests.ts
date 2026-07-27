import axios from 'axios';
import { LOCAL_SESSION_PATH, REFRESH_PATH, apiBaseUrl } from './auth-storage';

/**
 * Auth token endpoints accept empty/no body. Axios `post(url, null)` serializes
 * the body as the JSON literal `null`, which Nest's body-parser rejects with
 * 400 ("Unexpected token 'n', \"null\" is not valid JSON") — and login with an
 * undefined DTO can escalate to 500. Always send `{}` instead.
 */
export async function requestAuthToken(
  path: string,
  headers?: Record<string, string>
): Promise<{ access_token?: string; username?: string } | null> {
  try {
    const res = await axios.post(
      `${apiBaseUrl()}${path}`,
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        timeout: 10000
      }
    );
    return res.data ?? null;
  } catch {
    return null;
  }
}
export async function requestRefreshToken(currentToken: string) {
  return requestAuthToken(REFRESH_PATH, { Authorization: `Bearer ${currentToken}` });
}
export async function requestLocalSessionToken() {
  return requestAuthToken(LOCAL_SESSION_PATH);
}
