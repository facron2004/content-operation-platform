import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type {
  MerchantSalesRanking,
  MerchantSalesRefreshResult,
  MerchantSalesSummary
} from '../../../services/api/merchant-sales.api';

const mocks = vi.hoisted(() => ({
  getMerchantSalesSummary: vi.fn(),
  getMerchantSalesRanking: vi.fn(),
  getMerchantSalesTrend: vi.fn(),
  getMerchantSalesExportUrl: vi.fn(),
  postMerchantSalesRefresh: vi.fn(),
  downloadBlob: vi.fn(),
  success: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: { success: mocks.success }
}));

vi.mock('../../../services/api/merchant-sales.api', () => ({
  getMerchantSalesSummary: mocks.getMerchantSalesSummary,
  getMerchantSalesRanking: mocks.getMerchantSalesRanking,
  getMerchantSalesTrend: mocks.getMerchantSalesTrend,
  getMerchantSalesExportUrl: mocks.getMerchantSalesExportUrl,
  postMerchantSalesRefresh: mocks.postMerchantSalesRefresh
}));

vi.mock('../../../services/http-client', () => ({
  downloadBlob: mocks.downloadBlob,
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { createMerchantSalesState } from './merchant-sales-core';
import { createMerchantSalesLoaders } from './merchant-sales-ui';

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

function summaryFor(date: string): MerchantSalesSummary {
  return {
    window: 'day',
    date,
    endDate: date,
    totalGmv: 100,
    totalRefund: 0,
    totalVerify: 80,
    refundRate: 0,
    verifyRate: 0.8,
    paidOrderCount: 1,
    merchantCount: 1,
    packageCount: 1,
    dataSource: 'MerchantDailyMetrics'
  };
}

function rankingFor(merchantName: string): MerchantSalesRanking {
  return {
    items: [
      {
        merchantName,
        areaName: null,
        gmv: 100,
        gmvRefund: 0,
        gmvVerify: 80,
        refundRate: 0,
        verifyRate: 0.8,
        paidOrderCount: 1,
        orderCount: 1,
        packageCount: 1
      }
    ],
    pagination: { page: 1, pageSize: 20, hasMore: false, total: 1 }
  };
}

function refreshResult(): MerchantSalesRefreshResult {
  return { startDate: '2026-08-05', endDate: '2026-08-05', rowsUpserted: 1 };
}

describe('merchant sales request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.getMerchantSalesSummary.mockReset().mockResolvedValue(summaryFor('default'));
    mocks.getMerchantSalesRanking.mockReset().mockResolvedValue(rankingFor('default'));
    mocks.getMerchantSalesTrend.mockReset().mockResolvedValue({ items: [] });
    mocks.getMerchantSalesExportUrl.mockReset();
    mocks.postMerchantSalesRefresh.mockReset().mockResolvedValue(refreshResult());
    mocks.downloadBlob.mockReset();
    mocks.success.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest summary and ranking when an earlier reload resolves late', async () => {
    const firstSummary = createDeferred<MerchantSalesSummary>();
    const secondSummary = createDeferred<MerchantSalesSummary>();
    const firstRanking = createDeferred<MerchantSalesRanking>();
    const secondRanking = createDeferred<MerchantSalesRanking>();
    mocks.getMerchantSalesSummary
      .mockReset()
      .mockImplementationOnce(() => firstSummary.promise)
      .mockImplementationOnce(() => secondSummary.promise);
    mocks.getMerchantSalesRanking
      .mockReset()
      .mockImplementationOnce(() => firstRanking.promise)
      .mockImplementationOnce(() => secondRanking.promise);

    scope = effectScope();
    let state!: ReturnType<typeof createMerchantSalesState>;
    let loaders!: ReturnType<typeof createMerchantSalesLoaders>;
    scope.run(() => {
      state = createMerchantSalesState();
      loaders = createMerchantSalesLoaders(state);
    });

    const firstReload = loaders.reload();
    const secondReload = loaders.reload();
    secondSummary.resolve(summaryFor('latest'));
    secondRanking.resolve(rankingFor('latest'));
    await secondReload;
    firstSummary.reject(new Error('stale summary failure'));
    firstRanking.resolve(rankingFor('stale'));
    await firstReload;

    expect(state.summary.value?.date).toBe('latest');
    expect(state.ranking.value.items[0]?.merchantName).toBe('latest');
    expect(state.loadError.value).toBeNull();
    expect(state.loading.value).toBe(false);
    expect(state.listLoading.value).toBe(false);
  });

  it('keeps the latest page when an earlier ranking response resolves late', async () => {
    const first = createDeferred<MerchantSalesRanking>();
    const second = createDeferred<MerchantSalesRanking>();
    mocks.getMerchantSalesRanking
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    scope = effectScope();
    let state!: ReturnType<typeof createMerchantSalesState>;
    let loaders!: ReturnType<typeof createMerchantSalesLoaders>;
    scope.run(() => {
      state = createMerchantSalesState();
      loaders = createMerchantSalesLoaders(state);
    });

    const firstLoad = loaders.loadRanking();
    state.page.value = 2;
    const secondLoad = loaders.loadRanking();
    second.resolve(rankingFor('page-2'));
    await secondLoad;
    first.reject(new Error('stale ranking failure'));
    await firstLoad;

    expect(state.ranking.value.items[0]?.merchantName).toBe('page-2');
    expect(state.loadError.value).toBeNull();
    expect(state.listLoading.value).toBe(false);
  });

  it('clears a ranking error after a successful page retry', async () => {
    mocks.getMerchantSalesRanking
      .mockReset()
      .mockRejectedValueOnce(new Error('ranking failure'))
      .mockResolvedValueOnce(rankingFor('retried'));

    scope = effectScope();
    let state!: ReturnType<typeof createMerchantSalesState>;
    let loaders!: ReturnType<typeof createMerchantSalesLoaders>;
    scope.run(() => {
      state = createMerchantSalesState();
      loaders = createMerchantSalesLoaders(state);
    });

    await loaders.loadRanking();
    expect(state.rankingError.value).toBe('加载商家排行失败');
    expect(state.loadError.value).toBe('加载商家排行失败');

    await loaders.loadRanking();
    expect(state.rankingError.value).toBeNull();
    expect(state.loadError.value).toBeNull();
    expect(state.ranking.value.items[0]?.merchantName).toBe('retried');
  });

  it('keeps summary and trend errors independent during a reload and clears both on retry', async () => {
    mocks.getMerchantSalesSummary
      .mockReset()
      .mockRejectedValueOnce(new Error('summary failure'))
      .mockResolvedValueOnce(summaryFor('retried'));
    mocks.getMerchantSalesTrend
      .mockReset()
      .mockRejectedValueOnce(new Error('trend failure'))
      .mockResolvedValueOnce({ items: [] });

    scope = effectScope();
    let state!: ReturnType<typeof createMerchantSalesState>;
    let loaders!: ReturnType<typeof createMerchantSalesLoaders>;
    scope.run(() => {
      state = createMerchantSalesState();
      state.windowSel.value = 'week';
      loaders = createMerchantSalesLoaders(state);
    });

    await loaders.reload();
    expect(state.summaryError.value).toBe('加载汇总 KPI 失败');
    expect(state.trendError.value).toBe('加载趋势失败');
    expect(state.rankingError.value).toBeNull();
    expect(state.loadError.value).toBe('加载汇总 KPI 失败');

    await loaders.reload();
    expect(state.summaryError.value).toBeNull();
    expect(state.trendError.value).toBeNull();
    expect(state.loadError.value).toBeNull();
    expect(state.summary.value?.date).toBe('retried');
  });

  it('ignores late reload data and blocks new reads after scope disposal', async () => {
    const pendingSummary = createDeferred<MerchantSalesSummary>();
    const pendingRanking = createDeferred<MerchantSalesRanking>();
    mocks.getMerchantSalesSummary.mockReset().mockReturnValue(pendingSummary.promise);
    mocks.getMerchantSalesRanking.mockReset().mockReturnValue(pendingRanking.promise);

    scope = effectScope();
    let state!: ReturnType<typeof createMerchantSalesState>;
    let loaders!: ReturnType<typeof createMerchantSalesLoaders>;
    scope.run(() => {
      state = createMerchantSalesState();
      loaders = createMerchantSalesLoaders(state);
    });

    const reload = loaders.reload();
    scope.stop();
    pendingSummary.resolve(summaryFor('late'));
    pendingRanking.resolve(rankingFor('late'));
    await reload;
    await loaders.reload();
    await loaders.loadRanking();

    expect(state.summary.value).toBeNull();
    expect(state.ranking.value.items).toEqual([]);
    expect(state.loading.value).toBe(false);
    expect(state.listLoading.value).toBe(false);
    expect(mocks.getMerchantSalesSummary).toHaveBeenCalledTimes(1);
    expect(mocks.getMerchantSalesRanking).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate manual refresh requests while the first one is pending', async () => {
    const pending = createDeferred<MerchantSalesRefreshResult>();
    mocks.postMerchantSalesRefresh.mockReset().mockReturnValue(pending.promise);

    scope = effectScope();
    let loaders!: ReturnType<typeof createMerchantSalesLoaders>;
    scope.run(() => {
      const state = createMerchantSalesState();
      loaders = createMerchantSalesLoaders(state);
    });

    const first = loaders.forceRefresh();
    const duplicate = loaders.forceRefresh();
    await duplicate;
    expect(mocks.postMerchantSalesRefresh).toHaveBeenCalledTimes(1);

    pending.resolve(refreshResult());
    await first;

    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(mocks.getMerchantSalesSummary).toHaveBeenCalledTimes(1);
    expect(mocks.getMerchantSalesRanking).toHaveBeenCalledTimes(1);
  });

  it('keeps manual refresh errors separate and clears them after a retry', async () => {
    mocks.postMerchantSalesRefresh
      .mockReset()
      .mockRejectedValueOnce(new Error('refresh failure'))
      .mockResolvedValueOnce(refreshResult());

    scope = effectScope();
    let state!: ReturnType<typeof createMerchantSalesState>;
    let loaders!: ReturnType<typeof createMerchantSalesLoaders>;
    scope.run(() => {
      state = createMerchantSalesState();
      loaders = createMerchantSalesLoaders(state);
    });

    await loaders.forceRefresh();
    expect(state.refreshError.value).toBe('手动重算失败');
    expect(state.loadError.value).toBeNull();

    await loaders.forceRefresh();
    expect(state.refreshError.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it('suppresses late refresh feedback and reload after scope disposal', async () => {
    const pending = createDeferred<MerchantSalesRefreshResult>();
    mocks.postMerchantSalesRefresh.mockReset().mockReturnValue(pending.promise);

    scope = effectScope();
    let loaders!: ReturnType<typeof createMerchantSalesLoaders>;
    scope.run(() => {
      const state = createMerchantSalesState();
      loaders = createMerchantSalesLoaders(state);
    });

    const refresh = loaders.forceRefresh();
    scope.stop();
    pending.resolve(refreshResult());
    await refresh;

    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.getMerchantSalesSummary).not.toHaveBeenCalled();
    expect(mocks.getMerchantSalesRanking).not.toHaveBeenCalled();
  });
});
