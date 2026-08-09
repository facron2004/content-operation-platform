import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

vi.mock('../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

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
