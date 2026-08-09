import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { MerchantHeatmapResponse } from '../../../services/api/merchant.api';

const mocks = vi.hoisted(() => ({
  getMerchantHeatmap: vi.fn()
}));

vi.mock('../../../services/api/merchant.api', () => ({
  getMerchantHeatmap: mocks.getMerchantHeatmap
}));
vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (error: unknown, fallback: string) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof error.response === 'object' &&
      error.response !== null &&
      'data' in error.response &&
      typeof error.response.data === 'object' &&
      error.response.data !== null &&
      'message' in error.response.data &&
      typeof error.response.data.message === 'string'
    ) {
      return error.response.data.message;
    }
    return error instanceof Error ? error.message : fallback;
  }
}));

import { useMerchantHeatmap } from './useMerchantHeatmap';

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

function heatmapFor(areaName: string): MerchantHeatmapResponse {
  return {
    points: [
      {
        lat: 30.572,
        lng: 104.066,
        intensity: 1,
        areaName,
        merchantCount: 1,
        totalGmv: 100,
        merchants: [areaName]
      }
    ],
    totalMerchants: 1,
    mappedMerchants: 1,
    unmappedMerchants: 0,
    center: { lat: 30.572, lng: 104.066 },
    limit: 10000,
    truncated: false
  };
}

describe('merchant heatmap request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.getMerchantHeatmap.mockReset().mockResolvedValue(heatmapFor('default'));
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps one in-flight heatmap request', async () => {
    const pending = createDeferred<MerchantHeatmapResponse>();
    mocks.getMerchantHeatmap.mockReturnValue(pending.promise);
    scope = effectScope();
    const state = scope.run(() => useMerchantHeatmap())!;

    const firstLoad = state.load();
    const secondLoad = state.load();
    pending.resolve(heatmapFor('single-flight'));
    await Promise.all([firstLoad, secondLoad]);

    expect(mocks.getMerchantHeatmap).toHaveBeenCalledTimes(1);
    expect(state.data.value?.points[0]?.areaName).toBe('single-flight');
    expect(state.loading.value).toBe(false);
  });

  it('drops late data and blocks new requests after scope disposal', async () => {
    const pending = createDeferred<MerchantHeatmapResponse>();
    mocks.getMerchantHeatmap.mockReturnValue(pending.promise);
    scope = effectScope();
    const state = scope.run(() => useMerchantHeatmap())!;
    const load = state.load();

    scope.stop();
    pending.resolve(heatmapFor('late'));
    await load;
    await state.load();

    expect(state.data.value).toBeNull();
    expect(state.error.value).toBeNull();
    expect(state.loading.value).toBe(false);
    expect(state.isActive()).toBe(false);
    expect(mocks.getMerchantHeatmap).toHaveBeenCalledTimes(1);
  });

  it('does not publish a late failure after scope disposal', async () => {
    const pending = createDeferred<MerchantHeatmapResponse>();
    mocks.getMerchantHeatmap.mockReturnValue(pending.promise);
    scope = effectScope();
    const state = scope.run(() => useMerchantHeatmap())!;
    const load = state.load();

    scope.stop();
    pending.reject(new Error('late heatmap failure'));
    await load;

    expect(state.error.value).toBeNull();
    expect(state.loading.value).toBe(false);
  });

  it('preserves a structured API error message for the page alert', async () => {
    mocks.getMerchantHeatmap.mockRejectedValue({
      response: { status: 400, data: { message: '热力图查询范围过大' } }
    });
    scope = effectScope();
    const state = scope.run(() => useMerchantHeatmap())!;

    await state.load();

    expect(state.error.value).toBe('热力图查询范围过大');
    expect(state.loading.value).toBe(false);
  });
});
