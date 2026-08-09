import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

const mocks = vi.hoisted(() => ({
  getCookieStatus: vi.fn(),
  prefetchNavPaths: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: (callback: () => void) => callback()
  };
});

vi.mock('../services/api', () => ({ api: mocks }));
vi.mock('../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));
vi.mock('../stores/role', () => ({
  useRoleStore: () => ({ hasServerSession: false, permissions: [] })
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'overview' }),
  useRouter: () => ({})
}));
vi.mock('./shell-layout-nav', () => ({
  PAGE_TITLES: {},
  buildNavTree: () => []
}));
vi.mock('./route-view-cache', () => ({
  collectNavLeafPaths: () => [],
  prefetchNavPaths: mocks.prefetchNavPaths
}));

import { useShellLayout } from './useShellLayout';

describe('useShellLayout Cookie status polling', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.getCookieStatus.mockReset();
    mocks.prefetchNavPaths.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
    vi.useRealTimers();
  });

  it('does not overlap a slow status request with the next poll', async () => {
    let resolveFirst!: (status: { isValid: boolean }) => void;
    mocks.getCookieStatus
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValue({ isValid: true });

    scope = effectScope();
    scope.run(() => useShellLayout());
    expect(mocks.getCookieStatus).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.getCookieStatus).toHaveBeenCalledTimes(1);

    resolveFirst({ isValid: false });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.getCookieStatus).toHaveBeenCalledTimes(2);
  });

  it('ignores a status response that finishes after unmount', async () => {
    let resolveRequest!: (status: { isValid: boolean }) => void;
    mocks.getCookieStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    scope = effectScope();
    const layout = scope.run(() => useShellLayout())!;
    scope.stop();
    resolveRequest({ isValid: true });
    await Promise.resolve();

    expect(layout.cookieStatus.value).toBeNull();
  });

  it('surfaces a status read failure and clears it after a successful poll', async () => {
    mocks.getCookieStatus
      .mockRejectedValueOnce(new Error('status unavailable'))
      .mockResolvedValueOnce({ isValid: true });

    scope = effectScope();
    const layout = scope.run(() => useShellLayout())!;
    await Promise.resolve();

    expect(layout.cookieStatus.value).toBeNull();
    expect(layout.cookieStatusError.value).toBe('读取数据源连接状态失败，请稍后重试');

    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();

    expect(layout.cookieStatus.value).toEqual({ isValid: true });
    expect(layout.cookieStatusError.value).toBeNull();
  });

  it('cancels navigation prefetch after unmount', () => {
    const cancel = vi.fn();
    mocks.prefetchNavPaths.mockReturnValue(cancel);

    scope = effectScope();
    scope.run(() => useShellLayout());
    scope.stop();

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
