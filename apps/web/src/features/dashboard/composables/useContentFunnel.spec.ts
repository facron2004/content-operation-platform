import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

const mocks = vi.hoisted(() => ({
  getDashboardSummary: vi.fn()
}));

vi.mock('../../../services/api', () => ({
  api: { getDashboardSummary: mocks.getDashboardSummary }
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: () => undefined };
});

import { useContentFunnel } from './useContentFunnel';

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

function summaryFor(generatedCount: number) {
  return { generatedCount };
}

describe('useContentFunnel request lifecycle', () => {
  let scope: EffectScope | undefined;

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest funnel when an earlier request resolves late', async () => {
    const first = createDeferred<ReturnType<typeof summaryFor>>();
    const second = createDeferred<ReturnType<typeof summaryFor>>();
    mocks.getDashboardSummary
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const funnel = scope.run(() => useContentFunnel())!;

    const firstLoad = funnel.load();
    const secondLoad = funnel.load();
    second.resolve(summaryFor(2));
    await secondLoad;
    first.resolve(summaryFor(1));
    await firstLoad;

    expect(funnel.funnel.value.generatedCount).toBe(2);
    expect(funnel.loadError.value).toBeNull();
    expect(funnel.loading.value).toBe(false);
  });

  it('does not let a stale failure clear the latest funnel', async () => {
    const first = createDeferred<ReturnType<typeof summaryFor>>();
    const second = createDeferred<ReturnType<typeof summaryFor>>();
    mocks.getDashboardSummary
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const funnel = scope.run(() => useContentFunnel())!;

    const firstLoad = funnel.load();
    const secondLoad = funnel.load();
    second.resolve(summaryFor(2));
    await secondLoad;
    first.reject(new Error('stale failure'));
    await firstLoad;

    expect(funnel.funnel.value.generatedCount).toBe(2);
    expect(funnel.loadError.value).toBeNull();
    expect(funnel.loading.value).toBe(false);
  });

  it('surfaces an initial failure without treating zeroes as a successful read', async () => {
    mocks.getDashboardSummary.mockReset().mockRejectedValueOnce(new Error('request failed'));
    scope = effectScope();
    const funnel = scope.run(() => useContentFunnel())!;

    await funnel.load();

    expect(funnel.loadError.value).toBe('内容漏斗加载失败，请稍后重试');
    expect(funnel.funnel.value.generatedCount).toBe(0);
    expect(funnel.loading.value).toBe(false);
  });

  it('keeps the last successful funnel visible when a refresh fails', async () => {
    mocks.getDashboardSummary
      .mockReset()
      .mockResolvedValueOnce(summaryFor(4))
      .mockRejectedValueOnce(new Error('refresh failed'));
    scope = effectScope();
    const funnel = scope.run(() => useContentFunnel())!;

    await funnel.load();
    await funnel.load();

    expect(funnel.funnel.value.generatedCount).toBe(4);
    expect(funnel.loadError.value).toBe('内容漏斗加载失败，请稍后重试');
    expect(funnel.loading.value).toBe(false);
  });

  it('ignores late data and blocks new loads after scope disposal', async () => {
    const pending = createDeferred<ReturnType<typeof summaryFor>>();
    mocks.getDashboardSummary.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const funnel = scope.run(() => useContentFunnel())!;
    const load = funnel.load();

    scope.stop();
    pending.resolve(summaryFor(3));
    await load;
    await funnel.load();

    expect(funnel.funnel.value.generatedCount).toBe(0);
    expect(funnel.loadError.value).toBeNull();
    expect(funnel.loading.value).toBe(false);
    expect(mocks.getDashboardSummary).toHaveBeenCalledTimes(1);
  });
});
