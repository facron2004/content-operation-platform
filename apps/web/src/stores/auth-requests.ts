import axios from 'axios';
import { LOCAL_SESSION_PATH, REFRESH_PATH, apiBaseUrl } from './auth-storage';
export async function requestAuthToken(
  path: string,
  headers?: Record<string, string>
): Promise<{ access_token?: string; username?: string } | null> {
  try {
    const res = await axios.post(`${apiBaseUrl()}${path}`, null, { headers, timeout: 10000 });
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
