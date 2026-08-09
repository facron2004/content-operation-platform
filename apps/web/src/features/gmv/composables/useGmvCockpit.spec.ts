import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import type {
  GmvDistributionRow,
  GmvRefreshJob,
  GmvRefreshStartResponse,
  GmvHourlyPoint,
  GmvKpi,
  GmvMerchantRow,
  GmvTrendPoint
} from '../../../services/api/gmv.api';

const mocks = vi.hoisted(() => ({
  getGmvToday: vi.fn(),
  getGmvTrend: vi.fn(),
  getGmvHourly: vi.fn(),
  getGmvDistribution: vi.fn(),
  getGmvByMerchant: vi.fn(),
  startGmvRefresh: vi.fn(),
  getGmvRefreshStatus: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  confirm: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: () => undefined,
    onActivated: () => undefined
  };
});

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.success,
    info: mocks.info,
    warning: mocks.warning,
    error: mocks.error
  },
  ElMessageBox: { confirm: mocks.confirm }
}));

vi.mock('../../../services/api/gmv.api', () => ({
  getGmvToday: mocks.getGmvToday,
  getGmvTrend: mocks.getGmvTrend,
  getGmvHourly: mocks.getGmvHourly,
  getGmvDistribution: mocks.getGmvDistribution,
  getGmvByMerchant: mocks.getGmvByMerchant,
  startGmvRefresh: mocks.startGmvRefresh,
  getGmvRefreshStatus: mocks.getGmvRefreshStatus
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useGmvCockpit } from './useGmvCockpit';
import { describeRefreshProgress, pollGmvRefreshJob } from './gmv-refresh-lifecycle';
import {
  loadGmvDistribution,
  loadGmvHourly,
  loadGmvKpis,
  loadGmvTopMerchants,
  loadGmvTrend
} from './gmv-cockpit-core';

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

function trendFor(date: string): GmvTrendPoint {
  return {
    date,
    totalGmv: 100,
    gmvOnline: 60,
    gmvWallet: 40,
    gmvBonus: 0,
    totalRefund: 0,
    refundRate: 0,
    verifyRate: 1,
    paidOrderCount: 1
  };
}

function refreshStart(jobId: string): GmvRefreshStartResponse {
  return {
    jobId,
    startDate: '2026-08-05',
    endDate: '2026-08-05',
    status: 'queued'
  };
}

function refreshJob(jobId: string): GmvRefreshJob {
  return {
    jobId,
    status: 'done',
    startDate: '2026-08-05',
    endDate: '2026-08-05',
    progress: { pagesFetched: 1, fetched: 1, upserted: 1, skipped: 0, errors: 0 },
    result: {
      startDate: '2026-08-05',
      endDate: '2026-08-05',
      fetched: 1,
      upserted: 1,
      skipped: 0,
      errors: 0,
      pagesFetched: 1
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

describe('GMV cockpit request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.getGmvToday.mockReset().mockResolvedValue(null);
    mocks.getGmvTrend.mockReset().mockResolvedValue([]);
    mocks.getGmvHourly.mockReset().mockResolvedValue([]);
    mocks.getGmvDistribution.mockReset().mockResolvedValue({
      items: [],
      limit: 10,
      matched: 0,
      truncated: false
    });
    mocks.getGmvByMerchant.mockReset().mockResolvedValue({
      items: [],
      hasMore: false,
      truncated: false,
      limit: 20
    });
    mocks.startGmvRefresh.mockReset();
    mocks.getGmvRefreshStatus.mockReset();
    mocks.success.mockReset();
    mocks.info.mockReset();
    mocks.warning.mockReset();
    mocks.error.mockReset();
    mocks.confirm.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('ignores late trend data and blocks new reads after scope disposal', async () => {
    const pending = createDeferred<GmvTrendPoint[]>();
    mocks.getGmvTrend.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const cockpit = scope.run(() => useGmvCockpit())!;

    const load = cockpit.loadTrend();
    scope.stop();
    pending.resolve([trendFor('late')]);
    await load;
    await cockpit.loadTrend();

    expect(cockpit.trend.value).toEqual([]);
    expect(mocks.getGmvTrend).toHaveBeenCalledTimes(1);
  });

  it('keeps the latest trend response when an earlier granularity resolves late', async () => {
    const first = createDeferred<GmvTrendPoint[]>();
    const second = createDeferred<GmvTrendPoint[]>();
    mocks.getGmvTrend
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const cockpit = scope.run(() => useGmvCockpit())!;

    const firstLoad = cockpit.loadTrend();
    cockpit.trendGranularity.value = 'month';
    const secondLoad = cockpit.loadTrend();
    second.resolve([trendFor('latest')]);
    await secondLoad;
    first.resolve([trendFor('stale')]);
    await firstLoad;

    expect(cockpit.trend.value).toEqual([trendFor('latest')]);
    expect(cockpit.loadError.value).toBeNull();
  });

  it('surfaces timeout, network, and rate-limit failures as page errors', async () => {
    const loadError = ref<string | null>(null);

    mocks.getGmvToday.mockRejectedValueOnce({ code: 'ECONNABORTED' });
    await loadGmvKpis('2026-08-05', ref<GmvKpi | null>(null), loadError);
    expect(loadError.value).toBe('加载 KPI 失败');

    loadError.value = null;
    mocks.getGmvTrend.mockRejectedValueOnce(new Error('network down'));
    await loadGmvTrend('day', '2026-08-05', ref<GmvTrendPoint[]>([]), loadError);
    expect(loadError.value).toBe('加载趋势失败');

    loadError.value = null;
    mocks.getGmvHourly.mockRejectedValueOnce({ response: { status: 429 } });
    await loadGmvHourly('2026-08-05', ref<GmvHourlyPoint[]>([]), loadError);
    expect(loadError.value).toBe('加载分时失败');

    loadError.value = null;
    mocks.getGmvDistribution.mockRejectedValueOnce(new Error('distribution failed'));
    await loadGmvDistribution('area', ref<GmvDistributionRow[]>([]), loadError);
    expect(loadError.value).toBe('加载分布失败');

    loadError.value = null;
    mocks.getGmvByMerchant.mockRejectedValueOnce({ code: 'ECONNABORTED' });
    await loadGmvTopMerchants({
      sort: 'gmvDesc',
      page: 1,
      pageSize: 20,
      topMerchants: ref<GmvMerchantRow[]>([]),
      hasMore: ref(false),
      loadError
    });
    expect(loadError.value).toBe('加载商家榜失败');
  });

  it('cancels refresh polling after disposal without feedback or follow-up reads', async () => {
    const pendingStatus = createDeferred<GmvRefreshJob>();
    mocks.startGmvRefresh.mockResolvedValue(refreshStart('job-1'));
    mocks.getGmvRefreshStatus.mockReturnValue(pendingStatus.promise);
    scope = effectScope();
    const cockpit = scope.run(() => useGmvCockpit())!;

    const reload = cockpit.reload();
    await vi.waitFor(() => expect(mocks.getGmvRefreshStatus).toHaveBeenCalledTimes(1));
    scope.stop();
    pendingStatus.resolve(refreshJob('job-1'));
    await reload;
    await cockpit.reload();

    expect(mocks.getGmvRefreshStatus).toHaveBeenCalledTimes(1);
    expect(mocks.startGmvRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.warning).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('treats an interrupted persisted refresh as a terminal recoverable state', async () => {
    mocks.getGmvRefreshStatus.mockResolvedValue({
      ...refreshJob('job-restarted'),
      status: 'interrupted',
      result: undefined,
      error: '服务重启，回填任务已中断'
    });

    const onStatus = vi.fn();
    await expect(pollGmvRefreshJob('job-restarted', onStatus)).resolves.toMatchObject({
      status: 'interrupted',
      error: '服务重启，回填任务已中断'
    });

    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-restarted', status: 'interrupted' })
    );
    expect(
      describeRefreshProgress({
        ...refreshJob('job-restarted'),
        status: 'interrupted',
        result: undefined
      })
    ).toBe('服务重启，回填任务已中断，准备重试');
  });

  it('loads cockpit data after a completed refresh through the compatible facade', async () => {
    mocks.startGmvRefresh.mockResolvedValue(refreshStart('job-2'));
    mocks.getGmvRefreshStatus.mockResolvedValue(refreshJob('job-2'));
    scope = effectScope();
    const cockpit = scope.run(() => useGmvCockpit())!;

    await cockpit.reload();

    expect(mocks.getGmvToday).toHaveBeenCalledWith(cockpit.kpiDate.value, true);
    expect(mocks.getGmvByMerchant).toHaveBeenCalledWith('gmvDesc', 1, 20, true);
    expect(mocks.getGmvDistribution).toHaveBeenCalledWith('area', 10, true);
    expect(mocks.success).toHaveBeenCalledWith('已拉取 1 单 (1 页)');
    expect(cockpit.loading.value).toBe(false);
  });

  it('warns when the refresh completed with an external pull fallback', async () => {
    mocks.startGmvRefresh.mockResolvedValue(refreshStart('job-warning'));
    mocks.getGmvRefreshStatus.mockResolvedValue({
      ...refreshJob('job-warning'),
      result: {
        ...refreshJob('job-warning').result!,
        pullWarnings: ['JeSite pull failed: network down']
      }
    });
    scope = effectScope();
    const cockpit = scope.run(() => useGmvCockpit())!;

    await cockpit.reload();

    expect(mocks.warning).toHaveBeenCalledWith(
      '刷新完成，但JeSite 拉单未完成，已使用本地数据重算，当前页面可能仍是旧数据'
    );
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
  });
});
