import type { Ref } from 'vue';
import { requestBrowserRefresh, requestLocalAuthSession } from './auth-requests';
import { runExclusiveAuthRequest, type AuthSessionResult } from './auth-session-exclusive';
type AuthOpts = {
  inflight: { current: Promise<AuthSessionResult> | null };
  setAuth: (user: string) => void;
};
async function applySession(
  o: AuthOpts,
  fetch: () => Promise<{ authenticated?: boolean; username?: string } | null>,
  fallbackUser: string
): Promise<AuthSessionResult> {
  return runExclusiveAuthRequest(o.inflight, async () => {
    const data = await fetch();
    if (!data || data.authenticated === false) return null;
    const user = data.username ?? fallbackUser;
    if (!user) return null;
    o.setAuth(user);
    return true;
  });
}
export async function refreshAuthSession(
  options: AuthOpts & { username: Ref<string | null> }
): Promise<AuthSessionResult> {
  return applySession(options, requestBrowserRefresh, options.username.value ?? '');
}
export async function loginLocalAuthSession(options: AuthOpts): Promise<AuthSessionResult> {
  return applySession(options, requestLocalAuthSession, 'admin');
}
export { runExclusiveAuthRequest };
export type { AuthSessionResult };
