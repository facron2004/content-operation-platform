import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshAuthSession: vi.fn(),
  loginLocalAuthSession: vi.fn(),
  requestLogout: vi.fn()
}));

vi.mock('./auth-session', () => ({
  refreshAuthSession: mocks.refreshAuthSession,
  loginLocalAuthSession: mocks.loginLocalAuthSession
}));
vi.mock('./auth-requests', () => ({ requestLogout: mocks.requestLogout }));
vi.mock('./auth-storage', () => ({
  clearStoredAuth: vi.fn(),
  writeStoredAuth: vi.fn()
}));

import { createAuthCore } from './auth-actions-core';
import { createAuthRefreshScheduler } from './auth-refresh-scheduler';
import { runExclusiveAuthRequest } from './auth-session-exclusive';

describe('auth refresh lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not schedule another refresh after clear during an in-flight refresh', async () => {
    vi.useFakeTimers();
    const scheduler = createAuthRefreshScheduler();
    let resolveRefresh!: (value: boolean) => void;
    const refresh = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRefresh = resolve;
        })
    );

    scheduler.schedule({ isAuthenticated: () => true, refresh, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(refresh).toHaveBeenCalledTimes(1);

    scheduler.clear();
    resolveRefresh(true);
    await vi.advanceTimersByTimeAsync(50);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not restore authentication after logout invalidates an in-flight refresh', async () => {
    vi.useFakeTimers();
    let applyAuth!: (user: string) => void;
    let resolveSession!: (value: boolean) => void;
    mocks.refreshAuthSession.mockImplementation((options: { setAuth: (user: string) => void }) => {
      applyAuth = options.setAuth;
      return new Promise<boolean>((resolve) => {
        resolveSession = resolve;
      });
    });

    const authenticated = ref(false);
    const username = ref<string | null>(null);
    const scheduler = createAuthRefreshScheduler();
    const refreshInflight = { current: null as Promise<boolean | null> | null };
    const localSessionInflight = { current: null as Promise<boolean | null> | null };
    const core = createAuthCore({
      authenticated,
      username,
      isAuthenticated: () => authenticated.value,
      refreshInflight,
      localSessionInflight,
      scheduler
    });

    const pending = core.refresh();
    refreshInflight.current = pending;
    localSessionInflight.current = Promise.resolve(null);
    core.clearAuth();
    expect(refreshInflight.current).toBeNull();
    expect(localSessionInflight.current).toBeNull();
    applyAuth('stale-user');
    resolveSession(true);

    await expect(pending).resolves.toBeNull();
    expect(authenticated.value).toBe(false);
    expect(username.value).toBeNull();
    expect(mocks.requestLogout).toHaveBeenCalledTimes(1);
  });

  it('does not clear a newer auth request when an invalidated request settles', async () => {
    vi.useFakeTimers();
    const inflight = { current: null as Promise<boolean | null> | null };
    let resolveFirst!: (value: boolean) => void;
    const first = runExclusiveAuthRequest(
      inflight,
      () =>
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        })
    );

    inflight.current = null;
    let resolveSecond!: (value: boolean) => void;
    const second = runExclusiveAuthRequest(
      inflight,
      () =>
        new Promise<boolean>((resolve) => {
          resolveSecond = resolve;
        })
    );
    const secondRequest = inflight.current;
    resolveFirst(true);
    await vi.advanceTimersByTimeAsync(100);

    expect(secondRequest).not.toBeNull();
    expect(inflight.current).toBe(secondRequest);
    resolveSecond(true);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });
});
