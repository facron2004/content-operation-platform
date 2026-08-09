import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import type {
  OverviewKpi,
  OverviewTopOffender,
  OverviewTrendPoint
} from '../../../services/api/overview.api';

const mocks = vi.hoisted(() => ({
  getOverviewKpis: vi.fn(),
  getOverviewTrend: vi.fn(),
  getOverviewDistribution: vi.fn(),
  getOverviewTopOffenders: vi.fn()
}));

vi.mock('../../../services/api/overview.api', () => ({
  getOverviewKpis: mocks.getOverviewKpis,
  getOverviewTrend: mocks.getOverviewTrend,
  getOverviewDistribution: mocks.getOverviewDistribution,
  getOverviewTopOffenders: mocks.getOverviewTopOffenders
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { createOverviewActions } from './overview-core';

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

function kpiFor(date: string): OverviewKpi {
  return {
    date,
    totalMerchants: 1,
    totalSkus: 1,
    zeroSalesMerchants: 1,
    zeroSalesSkuCount: 1,
    zeroSalesSkuRatio: 1,
    todayGmv: 1,
    todayOrderCount: 1,
    updatedAt: date,
    dataSource: 'test'
  };
}

function trendFor(date: string): OverviewTrendPoint[] {
  return [{ date, gmv: 1, paidOrderCount: 1 }];
}

function offenderFor(merchantId: string): OverviewTopOffender {
  return {
    merchantId,
    merchantName: merchantId,
    areaName: null,
    stale30SkuCount: 1,
    totalSku: 1
  };
}

function distributionFor(key: string) {
  return {
    items: [{ key, totalSku: 1, stockLeft: 1 }],
    limit: 20,
    matched: 1,
    truncated: false
  };
}

function createState() {
  const state = {
    loading: ref(false),
    loadError: ref<string | null>(null),
    kpi: ref<OverviewKpi | null>(null),
    trend: ref<OverviewTrendPoint[]>([]),
    distribution: ref<Array<{ key: string; totalSku: number; stockLeft: number }>>([]),
    topOffenders: ref<OverviewTopOffender[]>([]),
    offendersLoading: ref(false),
    offendersTruncated: ref(false),
    offendersLimit: ref<number | null>(null),
    offendersMatched: ref<number | null>(null),
    distributionTruncated: ref(false),
    distributionLimit: ref<number | null>(null),
    distributionMatched: ref<number | null>(null),
    trendDays: ref<7 | 30>(7),
    staleDim: ref<'stale' | 'area' | 'category'>('stale'),
    kpiDate: ref('2026-08-05')
  };
  const actions = createOverviewActions({
    ...state,
    router: { push: vi.fn() } as never
  });
  return { state, actions };
}

function mockReloadSequence() {
  const first = {
    kpi: createDeferred<OverviewKpi>(),
    trend: createDeferred<OverviewTrendPoint[]>(),
    distribution: createDeferred<ReturnType<typeof distributionFor>>(),
    offenders: createDeferred<ReturnType<typeof offenderResponse>>()
  };
  const second = {
    kpi: createDeferred<OverviewKpi>(),
    trend: createDeferred<OverviewTrendPoint[]>(),
    distribution: createDeferred<ReturnType<typeof distributionFor>>(),
    offenders: createDeferred<ReturnType<typeof offenderResponse>>()
  };
  mocks.getOverviewKpis
    .mockReset()
    .mockImplementationOnce(() => first.kpi.promise)
    .mockImplementationOnce(() => second.kpi.promise);
  mocks.getOverviewTrend
    .mockReset()
    .mockImplementationOnce(() => first.trend.promise)
    .mockImplementationOnce(() => second.trend.promise);
  mocks.getOverviewDistribution
    .mockReset()
    .mockImplementationOnce(() => first.distribution.promise)
    .mockImplementationOnce(() => second.distribution.promise);
  mocks.getOverviewTopOffenders
    .mockReset()
    .mockImplementationOnce(() => first.offenders.promise)
    .mockImplementationOnce(() => second.offenders.promise);
  return { first, second };
}

function offenderResponse(merchantId: string) {
  return {
    items: [offenderFor(merchantId)],
    limit: 10,
    matched: 1,
    truncated: false
  };
}

describe('overview request lifecycle', () => {
  let scope: EffectScope | undefined;

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest reload data when an earlier response resolves late', async () => {
    const sequence = mockReloadSequence();
    scope = effectScope();
    const { state, actions } = scope.run(() => createState())!;

    const firstReload = actions.reload();
    const secondReload = actions.reload();
    sequence.second.kpi.resolve(kpiFor('latest'));
    sequence.second.trend.resolve(trendFor('latest'));
    sequence.second.distribution.resolve(distributionFor('latest'));
    sequence.second.offenders.resolve(offenderResponse('latest'));
    await secondReload;
    sequence.first.kpi.resolve(kpiFor('stale'));
    sequence.first.trend.resolve(trendFor('stale'));
    sequence.first.distribution.resolve(distributionFor('stale'));
    sequence.first.offenders.resolve(offenderResponse('stale'));
    await firstReload;

    expect(state.kpi.value?.date).toBe('latest');
    expect(state.trend.value[0]?.date).toBe('latest');
    expect(state.distribution.value[0]?.key).toBe('latest');
    expect(state.topOffenders.value[0]?.merchantId).toBe('latest');
    expect(state.loadError.value).toBeNull();
    expect(state.loading.value).toBe(false);
    expect(state.offendersLoading.value).toBe(false);
  });

  it('does not let a stale reload error replace the latest successful result', async () => {
    const sequence = mockReloadSequence();
    scope = effectScope();
    const { state, actions } = scope.run(() => createState())!;

    const firstReload = actions.reload();
    const secondReload = actions.reload();
    sequence.second.kpi.resolve(kpiFor('latest'));
    sequence.second.trend.resolve(trendFor('latest'));
    sequence.second.distribution.resolve(distributionFor('latest'));
    sequence.second.offenders.resolve(offenderResponse('latest'));
    await secondReload;
    sequence.first.kpi.reject(new Error('stale failure'));
    sequence.first.trend.resolve(trendFor('stale'));
    sequence.first.distribution.resolve(distributionFor('stale'));
    sequence.first.offenders.resolve(offenderResponse('stale'));
    await firstReload;

    expect(state.kpi.value?.date).toBe('latest');
    expect(state.topOffenders.value[0]?.merchantId).toBe('latest');
    expect(state.loadError.value).toBeNull();
    expect(state.loading.value).toBe(false);
  });

  it('ignores late data and blocks new overview requests after scope disposal', async () => {
    const pending = {
      kpi: createDeferred<OverviewKpi>(),
      trend: createDeferred<OverviewTrendPoint[]>(),
      distribution: createDeferred<ReturnType<typeof distributionFor>>(),
      offenders: createDeferred<ReturnType<typeof offenderResponse>>()
    };
    mocks.getOverviewKpis.mockReset().mockReturnValue(pending.kpi.promise);
    mocks.getOverviewTrend.mockReset().mockReturnValue(pending.trend.promise);
    mocks.getOverviewDistribution.mockReset().mockReturnValue(pending.distribution.promise);
    mocks.getOverviewTopOffenders.mockReset().mockReturnValue(pending.offenders.promise);
    scope = effectScope();
    const { state, actions } = scope.run(() => createState())!;
    const reload = actions.reload();

    scope.stop();
    pending.kpi.resolve(kpiFor('late'));
    pending.trend.resolve(trendFor('late'));
    pending.distribution.resolve(distributionFor('late'));
    pending.offenders.resolve(offenderResponse('late'));
    await reload;
    await actions.reload();
    await actions.loadTrend();
    await actions.loadDistribution();

    expect(state.kpi.value).toBeNull();
    expect(state.trend.value).toEqual([]);
    expect(state.distribution.value).toEqual([]);
    expect(state.topOffenders.value).toEqual([]);
    expect(state.loading.value).toBe(false);
    expect(state.offendersLoading.value).toBe(false);
    expect(mocks.getOverviewKpis).toHaveBeenCalledTimes(1);
    expect(mocks.getOverviewTrend).toHaveBeenCalledTimes(1);
    expect(mocks.getOverviewDistribution).toHaveBeenCalledTimes(1);
    expect(mocks.getOverviewTopOffenders).toHaveBeenCalledTimes(1);
  });
});
