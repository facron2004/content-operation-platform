import type { Ref } from 'vue';
import { requestLocalSessionToken, requestRefreshToken } from './auth-requests';
import { runExclusiveAuthRequest, type AuthTokenResult } from './auth-session-exclusive';
type AuthOpts = {
  inflight: { current: Promise<AuthTokenResult> | null };
  setAuth: (accessToken: string, user: string) => void;
};
async function applyToken(
  o: AuthOpts,
  fetch: () => Promise<{ access_token?: string; username?: string } | null>,
  fallbackUser: string
): Promise<AuthTokenResult> {
  return runExclusiveAuthRequest(o.inflight, async () => {
    const data = await fetch(),
      t = data?.access_token,
      u = data?.username ?? fallbackUser;
    if (!t) return null;
    o.setAuth(t, u);
    return t;
  });
}
export async function refreshAuthToken(
  options: AuthOpts & { token: Ref<string | null>; username: Ref<string | null> }
): Promise<AuthTokenResult> {
  const current = options.token.value;
  if (!current) return null;
  return applyToken(options, () => requestRefreshToken(current), options.username.value ?? '');
}
export async function loginLocalAuthSession(options: AuthOpts): Promise<AuthTokenResult> {
  return applyToken(options, requestLocalSessionToken, 'admin');
}
export { runExclusiveAuthRequest };
export type { AuthTokenResult };
