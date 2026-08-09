import type { Ref } from 'vue';
import { clearStoredAuth, writeStoredAuth } from './auth-storage';
import { loginLocalAuthSession, refreshAuthSession } from './auth-session';
import { COOKIE_REFRESH_INTERVAL_MS } from './auth-refresh-scheduler';
import { requestLogout } from './auth-requests';
import type { createAuthRefreshScheduler } from './auth-refresh-scheduler';
import type { AuthSessionResult } from './auth-session-exclusive';
type AuthRefreshScheduler = ReturnType<typeof createAuthRefreshScheduler>;
export type AuthActionOptions = {
  authenticated: Ref<boolean>;
  username: Ref<string | null>;
  isAuthenticated: () => boolean;
  refreshInflight: { current: Promise<AuthSessionResult> | null };
  localSessionInflight: { current: Promise<AuthSessionResult> | null };
  scheduler: AuthRefreshScheduler;
};
export function createAuthCore(options: AuthActionOptions) {
  let authGeneration = 0;
  const setAuth = (user: string) => {
    options.authenticated.value = true;
    options.username.value = user;
    writeStoredAuth(user);
    scheduleRefresh();
  };
  const setAuthForGeneration = (generation: number) => (user: string) => {
    if (generation === authGeneration) setAuth(user);
  };
  const clearAuth = () => {
    authGeneration += 1;
    options.authenticated.value = false;
    options.username.value = null;
    clearStoredAuth();
    options.scheduler.clear();
    options.refreshInflight.current = null;
    options.localSessionInflight.current = null;
    void requestLogout();
    // Drop in-memory GET cache + role session so a subsequent login (shared
    // browser / 401 forced re-auth) cannot flash previous user's scoped data
    // or keep hasServerSession true with stale roles until full reload.
    void import('../services/cache.service')
      .then(({ clearCache }) => clearCache())
      .catch(() => undefined);
    void import('./role')
      .then(({ useRoleStore }) => {
        try {
          useRoleStore().clearSession();
        } catch {
          /* pinia may not be active in unit tests */
        }
      })
      .catch(() => undefined);
  };
  const refresh = () => {
    const generation = authGeneration;
    return refreshAuthSession({
      username: options.username,
      inflight: options.refreshInflight,
      setAuth: setAuthForGeneration(generation)
    }).then((result) => (generation === authGeneration ? result : null));
  };
  const loginLocally = () => {
    const generation = authGeneration;
    return loginLocalAuthSession({
      inflight: options.localSessionInflight,
      setAuth: setAuthForGeneration(generation)
    }).then((result) => (generation === authGeneration ? result : null));
  };
  const scheduleRefresh = () =>
    options.scheduler.schedule({
      isAuthenticated: options.isAuthenticated,
      refresh,
      intervalMs: COOKIE_REFRESH_INTERVAL_MS
    });
  return { setAuth, clearAuth, refresh, loginLocally, scheduleRefresh };
}
