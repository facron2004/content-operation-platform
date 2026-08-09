import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import type { TaskKpiResponse } from '@content/shared';

const mocks = vi.hoisted(() => ({
  getTaskKPIs: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: () => undefined };
});

vi.mock('../../../services/api', () => ({
  api: { getTaskKPIs: mocks.getTaskKPIs }
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useDashboardTaskMetrics } from './useDashboardTaskMetrics';

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

function kpiFor(todayPending: number): TaskKpiResponse {
  return {
    todayPending,
    inProgress: 1,
    completed: 1,
    overdue: 1,
    failed: 1,
    todayTaskGmv: 1
  };
}

describe('useDashboardTaskMetrics request lifecycle', () => {
  let scope: EffectScope | undefined;

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest KPI when an earlier response resolves late', async () => {
    const first = createDeferred<TaskKpiResponse>();
    const second = createDeferred<TaskKpiResponse>();
    mocks.getTaskKPIs
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const metrics = scope.run(() => useDashboardTaskMetrics(ref(true)))!;

    const firstLoad = metrics.loadKPIs();
    const secondLoad = metrics.loadKPIs();
    second.resolve(kpiFor(2));
    await secondLoad;
    first.resolve(kpiFor(1));
    await firstLoad;

    expect(metrics.kpis.value.todayPending).toBe(2);
    expect(metrics.loadError.value).toBeNull();
    expect(metrics.loading.value).toBe(false);
  });

  it('keeps loading for the latest request when an earlier request fails', async () => {
    const first = createDeferred<TaskKpiResponse>();
    const second = createDeferred<TaskKpiResponse>();
    mocks.getTaskKPIs
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const metrics = scope.run(() => useDashboardTaskMetrics(ref(true)))!;

    const firstLoad = metrics.loadKPIs();
    const secondLoad = metrics.loadKPIs();
    first.reject(new Error('stale failure'));
    await firstLoad;

    expect(metrics.loading.value).toBe(true);
    second.resolve(kpiFor(2));
    await secondLoad;

    expect(metrics.kpis.value.todayPending).toBe(2);
    expect(metrics.loadError.value).toBeNull();
    expect(metrics.loading.value).toBe(false);
  });

  it('surfaces the latest KPI failure instead of presenting zeroes as data', async () => {
    mocks.getTaskKPIs.mockReset().mockRejectedValueOnce(new Error('request failed'));
    scope = effectScope();
    const metrics = scope.run(() => useDashboardTaskMetrics(ref(true)))!;

    await metrics.loadKPIs();

    expect(metrics.loadError.value).toBe('今日任务指标加载失败，请稍后重试');
    expect(metrics.kpis.value).toEqual({
      todayPending: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
      failed: 0,
      todayTaskGmv: 0
    });
    expect(metrics.loading.value).toBe(false);
  });

  it('ignores late KPI data and blocks new requests after scope disposal', async () => {
    const pending = createDeferred<TaskKpiResponse>();
    mocks.getTaskKPIs.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const metrics = scope.run(() => useDashboardTaskMetrics(ref(true)))!;
    const load = metrics.loadKPIs();

    scope.stop();
    pending.resolve(kpiFor(3));
    await load;
    await metrics.loadKPIs();

    expect(metrics.kpis.value.todayPending).toBe(0);
    expect(metrics.loadError.value).toBeNull();
    expect(metrics.loading.value).toBe(false);
    expect(mocks.getTaskKPIs).toHaveBeenCalledTimes(1);
  });
});
