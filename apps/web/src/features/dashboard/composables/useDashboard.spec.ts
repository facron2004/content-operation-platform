import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';

const mocks = vi.hoisted(() => ({
  getTodayOperationConsole: vi.fn(),
  clearDashboardCache: vi.fn()
}));

vi.mock('../../../services/api', () => ({
  api: { getTodayOperationConsole: mocks.getTodayOperationConsole }
}));
vi.mock('../../../services/cache.service', () => ({
  clearDashboardCache: mocks.clearDashboardCache
}));
vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useDashboard } from './useDashboard';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function consoleFor(date: string) {
  return { date };
}

describe('useDashboard request lifecycle', () => {
  let scope: EffectScope | undefined;

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest role response when the previous role resolves late', async () => {
    const first = createDeferred<ReturnType<typeof consoleFor>>();
    const second = createDeferred<ReturnType<typeof consoleFor>>();
    mocks.getTodayOperationConsole
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const role = ref('platform_operator');
    scope = effectScope();
    const dashboard = scope.run(() => useDashboard(role))!;

    const firstLoad = dashboard.load();
    role.value = 'area_operator';
    await nextTick();
    second.resolve(consoleFor('area'));
    await Promise.resolve();
    first.resolve(consoleFor('platform'));
    await firstLoad;

    expect(dashboard.consoleData.value.date).toBe('area');
    expect(dashboard.loadError.value).toBeNull();
    expect(dashboard.loading.value).toBe(false);
  });

  it('does not let a stale role error clear the latest successful result', async () => {
    const first = createDeferred<ReturnType<typeof consoleFor>>();
    const second = createDeferred<ReturnType<typeof consoleFor>>();
    mocks.getTodayOperationConsole
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const role = ref('platform_operator');
    scope = effectScope();
    const dashboard = scope.run(() => useDashboard(role))!;

    const firstLoad = dashboard.load();
    role.value = 'area_operator';
    await nextTick();
    second.resolve(consoleFor('area'));
    await Promise.resolve();
    first.reject(new Error('stale failure'));
    await firstLoad;

    expect(dashboard.consoleData.value.date).toBe('area');
    expect(dashboard.loadError.value).toBeNull();
    expect(dashboard.loading.value).toBe(false);
  });

  it('ignores a response and blocks new loads after scope disposal', async () => {
    const pending = createDeferred<ReturnType<typeof consoleFor>>();
    mocks.getTodayOperationConsole.mockReset().mockReturnValue(pending.promise);
    const role = ref('platform_operator');
    scope = effectScope();
    const dashboard = scope.run(() => useDashboard(role))!;
    const load = dashboard.load();

    scope.stop();
    pending.resolve(consoleFor('late'));
    await load;
    await dashboard.load();

    expect(dashboard.consoleData.value.date).toBe('');
    expect(dashboard.loading.value).toBe(false);
    expect(mocks.getTodayOperationConsole).toHaveBeenCalledTimes(1);
  });
});
