import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import type { OverviewDistributionResponse, OverviewKpi } from '../../../services/api/overview.api';

const mocks = vi.hoisted(() => ({
  getOverviewKpis: vi.fn(),
  getOverviewDistribution: vi.fn(),
  useZeroSales: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: () => undefined };
});

vi.mock('../../../services/api/overview.api', () => ({
  getOverviewKpis: mocks.getOverviewKpis,
  getOverviewDistribution: mocks.getOverviewDistribution
}));

vi.mock('../../../services/http-client-utils', () => ({
  isRequestCanceled: () => false
}));

vi.mock('../../../utils/chart-options', () => ({
  buildCategoryBar: (options: unknown) => options
}));

vi.mock('./useZeroSales', () => ({
  STALE_BUCKET_LABELS: {
    normal: '正常',
    stale_7d: '7天未销',
    stale_15d: '15天未销',
    stale_30d: '30天未销',
    stale_60d: '60天未销'
  },
  useZeroSales: mocks.useZeroSales
}));

import { useZeroSalesPage } from './useZeroSalesPage';

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

function kpi(date: string): OverviewKpi {
  return {
    date,
    totalMerchants: 1,
    totalSkus: 2,
    zeroSalesMerchants: 1,
    zeroSalesSkuCount: 1,
    zeroSalesSkuRatio: 0.5,
    todayGmv: 100,
    todayOrderCount: 1,
    updatedAt: `${date}T00:00:00.000Z`,
    dataSource: 'test'
  };
}

function distribution(key: string): OverviewDistributionResponse {
  return {
    items: [{ key, totalSku: 1, stockLeft: 2 }],
    limit: 12,
    matched: 1,
    truncated: false
  };
}

function resetMocks() {
  mocks.getOverviewKpis.mockReset().mockResolvedValue(kpi('default'));
  mocks.getOverviewDistribution.mockReset().mockResolvedValue(distribution('default'));
  mocks.useZeroSales.mockReset().mockImplementation(() => ({
    staleBucket: ref('stale_30d'),
    reload: vi.fn().mockResolvedValue(undefined),
    onFilterChange: vi.fn()
  }));
}

describe('zero sales summary request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest KPI when an earlier summary reload resolves late', async () => {
    const first = createDeferred<OverviewKpi>();
    const second = createDeferred<OverviewKpi>();
    mocks.getOverviewKpis
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const page = scope.run(() => useZeroSalesPage())!;

    const firstReload = page.reloadAll();
    const secondReload = page.reloadAll();
    second.resolve(kpi('new'));
    await secondReload;
    first.resolve(kpi('old'));
    await firstReload;

    expect(page.overviewKpi.value?.date).toBe('new');
    expect(page.summaryError.value).toBeNull();
    expect(page.summaryLoading.value).toBe(false);
  });

  it('forces every overview summary request on manual reload', async () => {
    scope = effectScope();
    const page = scope.run(() => useZeroSalesPage())!;
    await page.loadDim('category');
    mocks.getOverviewKpis.mockClear();
    mocks.getOverviewDistribution.mockClear();

    await page.reloadAll();

    expect(mocks.getOverviewKpis).toHaveBeenCalledWith(undefined, true);
    expect(mocks.getOverviewDistribution).toHaveBeenCalledWith('stale', 10, undefined, true);
    expect(mocks.getOverviewDistribution).toHaveBeenCalledWith('category', 12, undefined, true);
  });

  it('keeps the latest dimension distribution when the operator switches quickly', async () => {
    const first = createDeferred<OverviewDistributionResponse>();
    const second = createDeferred<OverviewDistributionResponse>();
    mocks.getOverviewDistribution
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const page = scope.run(() => useZeroSalesPage())!;

    const firstLoad = page.loadDim('area');
    const secondLoad = page.loadDim('category');
    expect(mocks.getOverviewDistribution).toHaveBeenNthCalledWith(1, 'area', 12);
    expect(mocks.getOverviewDistribution).toHaveBeenNthCalledWith(2, 'category', 12);
    second.resolve(distribution('category-new'));
    await secondLoad;
    first.resolve(distribution('area-old'));
    await firstLoad;

    const option = JSON.stringify(page.dimOption.value);
    expect(page.dim.value).toBe('category');
    expect(option).toContain('category-new');
    expect(option).not.toContain('area-old');
  });

  it('surfaces dimension failures and clears the error after a successful retry', async () => {
    mocks.getOverviewDistribution
      .mockReset()
      .mockRejectedValueOnce(new Error('区域分布不可用'))
      .mockResolvedValueOnce(distribution('area-recovered'));
    scope = effectScope();
    const page = scope.run(() => useZeroSalesPage())!;

    await page.loadDim('area');
    expect(page.summaryError.value).toBe('区域分布不可用');

    await page.loadDim('area');
    expect(page.summaryError.value).toBeNull();
    expect(JSON.stringify(page.dimOption.value)).toContain('area-recovered');
  });

  it('ignores a late dimension failure after a newer dimension succeeds', async () => {
    const first = createDeferred<OverviewDistributionResponse>();
    const second = createDeferred<OverviewDistributionResponse>();
    mocks.getOverviewDistribution
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const page = scope.run(() => useZeroSalesPage())!;

    const firstLoad = page.loadDim('area');
    const secondLoad = page.loadDim('category');
    second.resolve(distribution('category-new'));
    await secondLoad;
    first.reject(new Error('area-old-failure'));
    await firstLoad;

    expect(page.summaryError.value).toBeNull();
    expect(JSON.stringify(page.dimOption.value)).toContain('category-new');
  });

  it('ignores late summary data and blocks new summary requests after disposal', async () => {
    const pending = createDeferred<OverviewKpi>();
    mocks.getOverviewKpis.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const page = scope.run(() => useZeroSalesPage())!;
    const reload = page.reloadAll();

    scope.stop();
    pending.resolve(kpi('late'));
    await reload;
    await page.reloadAll();

    expect(page.overviewKpi.value).toBeNull();
    expect(page.summaryLoading.value).toBe(false);
    expect(mocks.getOverviewKpis).toHaveBeenCalledTimes(1);
  });
});
