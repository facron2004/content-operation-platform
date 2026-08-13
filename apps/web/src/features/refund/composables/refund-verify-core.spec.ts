import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type {
  RefundTodayPayload as ApiRefundTodayPayload,
  RefundTrendPoint,
  TopMerchantRow,
  VerifyTodayPayload as ApiVerifyTodayPayload,
  VerifyTrendPoint
} from '../../../services/api/refund.api';

const mocks = vi.hoisted(() => ({
  getRefundToday: vi.fn(),
  getRefundTopMerchants: vi.fn(),
  getRefundTrend: vi.fn(),
  getVerifyToday: vi.fn(),
  getVerifyTrend: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: () => undefined };
});

vi.mock('../../../services/api/refund.api', () => ({
  getRefundToday: mocks.getRefundToday,
  getRefundTopMerchants: mocks.getRefundTopMerchants,
  getRefundTrend: mocks.getRefundTrend,
  getVerifyToday: mocks.getVerifyToday,
  getVerifyTrend: mocks.getVerifyTrend
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { bindRefundVerifyLoaders, createRefundVerifyState } from './refund-verify-core';

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

function merchant(merchantId: string): TopMerchantRow {
  return {
    merchantId,
    merchantName: merchantId,
    areaName: null,
    gmv: 100,
    refund: 10,
    verify: 5,
    refundRate: 0.1,
    verifyRate: 0.05,
    paidOrderCount: 10
  };
}

function refundToday(date: string): ApiRefundTodayPayload {
  return {
    date,
    totalRefund: 10,
    totalGmv: 100,
    refundRate: 0.1,
    refundCount: 1,
    paidOrderCount: 10,
    topRefundMerchants: [],
    updatedAt: `${date}T00:00:00.000Z`
  };
}

function verifyToday(date: string): ApiVerifyTodayPayload {
  return {
    date,
    totalVerify: 5,
    totalGmv: 100,
    verifyRate: 0.05,
    verifyCount: 1,
    paidOrderCount: 10,
    topVerifyMerchants: [],
    updatedAt: `${date}T00:00:00.000Z`
  };
}

function refundTrend(date: string): RefundTrendPoint {
  return {
    date,
    totalRefund: 10,
    refundRate: 0.1,
    refundCount: 1,
    paidOrderCount: 10
  };
}

function verifyTrend(date: string): VerifyTrendPoint {
  return {
    date,
    totalVerify: 5,
    verifyRate: 0.05,
    verifyCount: 1,
    paidOrderCount: 10
  };
}

function topMerchants(merchantId: string) {
  return { items: [merchant(merchantId)], hasMore: false, limit: 20, truncated: false };
}

function resetApiMocks() {
  mocks.getRefundToday.mockReset().mockResolvedValue(refundToday('default'));
  mocks.getRefundTopMerchants.mockReset().mockResolvedValue(topMerchants('default'));
  mocks.getRefundTrend.mockReset().mockResolvedValue([refundTrend('default')]);
  mocks.getVerifyToday.mockReset().mockResolvedValue(verifyToday('default'));
  mocks.getVerifyTrend.mockReset().mockResolvedValue([verifyTrend('default')]);
}

describe('refund verify request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    resetApiMocks();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest KPI when an earlier reload resolves late', async () => {
    const first = createDeferred<ApiRefundTodayPayload>();
    const second = createDeferred<ApiRefundTodayPayload>();
    mocks.getRefundToday
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const state = createRefundVerifyState();
    state.kpiDate.value = '2026-08-05';
    scope = effectScope();
    const loaders = scope.run(() => bindRefundVerifyLoaders(state))!;

    const firstReload = loaders.reload();
    const secondReload = loaders.reload();
    second.resolve(refundToday('new'));
    await secondReload;
    first.resolve(refundToday('old'));
    await firstReload;

    expect(state.refundToday.value?.date).toBe('new');
    expect(state.loadError.value).toBeNull();
    expect(state.loading.value).toBe(false);
    expect(mocks.getRefundToday).toHaveBeenNthCalledWith(1, '2026-08-05', 'day', false);
    expect(mocks.getRefundToday).toHaveBeenNthCalledWith(2, '2026-08-05', 'day', false);
  });

  it('uses force only for an explicit manual full reload', async () => {
    const state = createRefundVerifyState();
    state.kpiDate.value = '2026-08-05';
    scope = effectScope();
    const loaders = scope.run(() => bindRefundVerifyLoaders(state))!;

    await loaders.reload();
    expect(mocks.getRefundToday).toHaveBeenLastCalledWith('2026-08-05', 'day', false);
    expect(mocks.getRefundTrend).toHaveBeenLastCalledWith(7, '2026-08-05', 'day', false);
    expect(mocks.getRefundTopMerchants).toHaveBeenLastCalledWith(
      expect.objectContaining({ date: '2026-08-05', window: 'day' }),
      false
    );

    await loaders.reload(true);
    expect(mocks.getRefundToday).toHaveBeenLastCalledWith('2026-08-05', 'day', true);
    expect(mocks.getRefundTrend).toHaveBeenLastCalledWith(7, '2026-08-05', 'day', true);
    expect(mocks.getRefundTopMerchants).toHaveBeenLastCalledWith(
      expect.objectContaining({ date: '2026-08-05', window: 'day' }),
      true
    );

    await loaders.loadTrend();
    expect(mocks.getRefundTrend).toHaveBeenLastCalledWith(7, '2026-08-05', 'day', false);
  });

  it('does not let a stale trend error replace the latest trend', async () => {
    const first = createDeferred<RefundTrendPoint[]>();
    const second = createDeferred<RefundTrendPoint[]>();
    mocks.getRefundTrend
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const state = createRefundVerifyState();
    state.trendDays.value = 30;
    state.kpiDate.value = '2026-08-05';
    scope = effectScope();
    const loaders = scope.run(() => bindRefundVerifyLoaders(state))!;

    const firstLoad = loaders.loadTrend();
    const secondLoad = loaders.loadTrend();
    second.resolve([refundTrend('new')]);
    await secondLoad;
    first.reject(new Error('stale trend failure'));
    await firstLoad;

    expect(state.trend.value[0]?.date).toBe('new');
    expect(state.loadError.value).toBeNull();
    expect(mocks.getRefundTrend).toHaveBeenNthCalledWith(1, 30, '2026-08-05', 'day', false);
    expect(mocks.getRefundTrend).toHaveBeenNthCalledWith(2, 30, '2026-08-05', 'day', false);
  });

  it('keeps the latest merchant page loading state while an earlier response resolves', async () => {
    const first = createDeferred<ReturnType<typeof topMerchants>>();
    const second = createDeferred<ReturnType<typeof topMerchants>>();
    mocks.getRefundTopMerchants
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const state = createRefundVerifyState();
    scope = effectScope();
    const loaders = scope.run(() => bindRefundVerifyLoaders(state))!;

    const firstLoad = loaders.loadTopMerchants();
    const secondLoad = loaders.loadTopMerchants();
    first.resolve(topMerchants('old'));
    await firstLoad;

    expect(state.topMerchants.value).toEqual([]);
    expect(state.listLoading.value).toBe(true);

    second.resolve(topMerchants('new'));
    await secondLoad;

    expect(state.topMerchants.value[0]?.merchantId).toBe('new');
    expect(state.listLoading.value).toBe(false);
  });

  it('ignores late data and blocks new requests after scope disposal', async () => {
    const pending = createDeferred<ReturnType<typeof topMerchants>>();
    mocks.getRefundTopMerchants.mockReset().mockReturnValue(pending.promise);
    const state = createRefundVerifyState();
    scope = effectScope();
    const loaders = scope.run(() => bindRefundVerifyLoaders(state))!;
    const load = loaders.loadTopMerchants();

    scope.stop();
    pending.resolve(topMerchants('late'));
    await load;
    await loaders.loadTopMerchants();

    expect(state.topMerchants.value).toEqual([]);
    expect(state.listLoading.value).toBe(false);
    expect(mocks.getRefundTopMerchants).toHaveBeenCalledTimes(1);
  });

  it('keeps KPI and trend failures separate and clears each error on retry', async () => {
    mocks.getRefundToday.mockRejectedValueOnce(new Error('kpi unavailable'));
    mocks.getRefundTrend.mockRejectedValueOnce(new Error('trend unavailable'));
    const state = createRefundVerifyState();
    scope = effectScope();
    const loaders = scope.run(() => bindRefundVerifyLoaders(state))!;

    await loaders.reload();

    expect(state.kpiError.value).toBe('加载 KPI 失败');
    expect(state.trendError.value).toBe('加载趋势失败');
    expect(state.merchantError.value).toBeNull();
    expect(state.loadError.value).toBe('加载 KPI 失败');

    await loaders.reload();

    expect(state.kpiError.value).toBeNull();
    expect(state.trendError.value).toBeNull();
    expect(state.merchantError.value).toBeNull();
    expect(state.loadError.value).toBeNull();
  });
});
