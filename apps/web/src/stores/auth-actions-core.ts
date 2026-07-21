import type { Ref } from 'vue';
import {
  clearStoredAuth,
  MIN_REFRESH_INTERVAL_MS,
  REFRESH_LEAD_MS,
  writeStoredAuth
} from './auth-storage';
import { loginLocalAuthSession, refreshAuthToken } from './auth-session';
import type { createAuthRefreshScheduler } from './auth-refresh-scheduler';
type AuthRefreshScheduler = ReturnType<typeof createAuthRefreshScheduler>;
export type AuthActionOptions = {
  token: Ref<string | null>;
  username: Ref<string | null>;
  isAuthenticated: () => boolean;
  refreshInflight: { current: Promise<string | null> | null };
  localSessionInflight: { current: Promise<string | null> | null };
  scheduler: AuthRefreshScheduler;
};
export function createAuthCore(options: AuthActionOptions) {
  const setAuth = (accessToken: string, user: string) => {
    options.token.value = accessToken;
    options.username.value = user;
    writeStoredAuth(accessToken, user);
    scheduleRefresh();
  };
  const clearAuth = () => {
    options.token.value = null;
    options.username.value = null;
    clearStoredAuth();
    options.scheduler.clear();
  };
  const refresh = () =>
    refreshAuthToken({
      token: options.token,
      username: options.username,
      inflight: options.refreshInflight,
      setAuth
    });
  const loginLocally = () =>
    loginLocalAuthSession({ inflight: options.localSessionInflight, setAuth });
  const scheduleRefresh = () =>
    options.scheduler.schedule({
      token: options.token.value,
      isAuthenticated: options.isAuthenticated,
      refresh,
      leadMs: REFRESH_LEAD_MS,
      minIntervalMs: MIN_REFRESH_INTERVAL_MS
    });
  return { setAuth, clearAuth, refresh, loginLocally, scheduleRefresh };
}
