import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

const mocks = vi.hoisted(() => ({ clearCache: vi.fn() }));

vi.mock('../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));
vi.mock('../services/cache.service', () => ({ clearCache: mocks.clearCache }));

import { useApiFetch } from './useApiFetch';

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

describe('useApiFetch request lifecycle', () => {
  let scope: EffectScope | undefined;

  afterEach(() => {
    scope?.stop();
    scope = undefined;
    mocks.clearCache.mockReset();
  });

  it('scopes cache eviction and forwards force only for a manual load', async () => {
    const fetcher = vi.fn(async (force: boolean) => (force ? 'fresh' : 'cached'));
    scope = effectScope();
    const state = scope.run(() =>
      useApiFetch(fetcher, { cacheKeyPattern: '/content/communities' })
    )!;

    await state.load();
    expect(fetcher).toHaveBeenLastCalledWith(false);
    expect(mocks.clearCache).not.toHaveBeenCalled();

    await state.load(true);
    expect(mocks.clearCache).toHaveBeenCalledWith('/content/communities');
    expect(fetcher).toHaveBeenLastCalledWith(true);
    expect(state.data.value).toBe('fresh');
  });

  it('keeps the latest response when an earlier request resolves late', async () => {
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const state = scope.run(() => useApiFetch(fetcher))!;

    const firstLoad = state.load();
    const secondLoad = state.load();
    second.resolve('latest');
    await secondLoad;
    first.resolve('stale');
    await firstLoad;

    expect(state.data.value).toBe('latest');
    expect(state.error.value).toBeNull();
    expect(state.loading.value).toBe(false);
  });

  it('does not let a stale rejection replace the latest successful result', async () => {
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const state = scope.run(() => useApiFetch(fetcher))!;

    const firstLoad = state.load();
    const secondLoad = state.load();
    second.resolve('latest');
    await secondLoad;
    first.reject(new Error('stale failure'));
    await firstLoad;

    expect(state.data.value).toBe('latest');
    expect(state.error.value).toBeNull();
    expect(state.loading.value).toBe(false);
  });

  it('invalidates in-flight work and blocks new requests after scope disposal', async () => {
    const pending = createDeferred<string>();
    const fetcher = vi.fn().mockReturnValue(pending.promise);
    scope = effectScope();
    const state = scope.run(() => useApiFetch(fetcher))!;
    const load = state.load();

    scope.stop();
    pending.resolve('late');
    await load;
    await state.load();

    expect(state.data.value).toBeNull();
    expect(state.loading.value).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
