import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { TaskKpiResponse } from '@content/shared';

const mocks = vi.hoisted(() => ({
  getTaskKPIs: vi.fn(),
  listTasks: vi.fn(),
  deleteTask: vi.fn(),
  errorMessage: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: () => undefined };
});

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} })
}));

vi.mock('element-plus', () => ({
  ElMessage: { error: mocks.errorMessage }
}));

vi.mock('../../../services/api', () => ({
  api: {
    getTaskKPIs: mocks.getTaskKPIs,
    listTasks: mocks.listTasks,
    deleteTask: mocks.deleteTask
  }
}));

vi.mock('../../../composables/useConfirmDelete', () => ({
  confirmAndDelete: vi.fn()
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useTaskCenter } from './useTaskCenter';

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

type TaskListPayload = {
  items: Array<{ taskId: string }>;
  total: number;
  dateFrom?: string;
  dateTo?: string;
};

function taskPage(taskId: string, dateFrom: string): TaskListPayload {
  return {
    items: [{ taskId }],
    total: 1,
    dateFrom,
    dateTo: '2026-08-05'
  };
}

describe('useTaskCenter KPI request lifecycle', () => {
  let scope: EffectScope | undefined;

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest KPI when an earlier request resolves late', async () => {
    const first = createDeferred<TaskKpiResponse>();
    const second = createDeferred<TaskKpiResponse>();
    mocks.getTaskKPIs
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const taskCenter = scope.run(() => useTaskCenter())!;

    const firstLoad = taskCenter.loadKPIs();
    const secondLoad = taskCenter.loadKPIs();
    second.resolve(kpiFor(2));
    await secondLoad;
    first.resolve(kpiFor(1));
    await firstLoad;

    expect(taskCenter.kpis.value?.todayPending).toBe(2);
    expect(taskCenter.kpiLoading.value).toBe(false);
    expect(mocks.errorMessage).not.toHaveBeenCalled();
  });

  it('does not let a stale KPI error replace the latest success', async () => {
    const first = createDeferred<TaskKpiResponse>();
    const second = createDeferred<TaskKpiResponse>();
    mocks.getTaskKPIs
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const taskCenter = scope.run(() => useTaskCenter())!;

    const firstLoad = taskCenter.loadKPIs();
    const secondLoad = taskCenter.loadKPIs();
    second.resolve(kpiFor(2));
    await secondLoad;
    first.reject(new Error('stale failure'));
    await firstLoad;

    expect(taskCenter.kpis.value?.todayPending).toBe(2);
    expect(taskCenter.kpiError.value).toBeNull();
    expect(taskCenter.kpiLoading.value).toBe(false);
    expect(mocks.errorMessage).not.toHaveBeenCalled();
  });

  it('surfaces KPI failure and clears it after a successful retry', async () => {
    mocks.getTaskKPIs
      .mockReset()
      .mockRejectedValueOnce(new Error('kpi unavailable'))
      .mockResolvedValueOnce(kpiFor(4));
    scope = effectScope();
    const taskCenter = scope.run(() => useTaskCenter())!;

    await taskCenter.loadKPIs();
    expect(taskCenter.kpis.value).toBeNull();
    expect(taskCenter.kpiError.value).toBe('加载任务指标失败');

    await taskCenter.loadKPIs();
    expect(taskCenter.kpis.value?.todayPending).toBe(4);
    expect(taskCenter.kpiError.value).toBeNull();
  });

  it('ignores late KPI data and blocks new requests after scope disposal', async () => {
    const pending = createDeferred<TaskKpiResponse>();
    mocks.getTaskKPIs.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const taskCenter = scope.run(() => useTaskCenter())!;
    const load = taskCenter.loadKPIs();

    scope.stop();
    pending.resolve(kpiFor(3));
    await load;
    await taskCenter.loadKPIs();

    expect(taskCenter.kpis.value).toBeNull();
    expect(taskCenter.kpiLoading.value).toBe(false);
    expect(mocks.getTaskKPIs).toHaveBeenCalledTimes(1);
  });

  it('keeps the latest task list and effective window when an earlier response resolves late', async () => {
    const first = createDeferred<TaskListPayload>();
    const second = createDeferred<TaskListPayload>();
    mocks.listTasks
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const taskCenter = scope.run(() => useTaskCenter())!;

    const firstLoad = taskCenter.load();
    const secondLoad = taskCenter.load();
    second.resolve(taskPage('second', '2026-08-02'));
    await secondLoad;
    first.resolve(taskPage('first', '2026-08-01'));
    await firstLoad;

    expect(taskCenter.tasks.value[0]?.taskId).toBe('second');
    expect(taskCenter.windowLabel.value).toBe('2026-08-02 ~ 2026-08-05');
    expect(taskCenter.loading.value).toBe(false);
  });

  it('drops late task list data and blocks new reads after scope disposal', async () => {
    const pending = createDeferred<TaskListPayload>();
    mocks.listTasks.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const taskCenter = scope.run(() => useTaskCenter())!;

    const load = taskCenter.load();
    scope.stop();
    pending.resolve(taskPage('late', '2026-08-01'));
    await load;
    await taskCenter.load();

    expect(taskCenter.tasks.value).toEqual([]);
    expect(taskCenter.listDateFrom.value).toBeUndefined();
    expect(taskCenter.listDateTo.value).toBeUndefined();
    expect(taskCenter.loading.value).toBe(false);
    expect(mocks.listTasks).toHaveBeenCalledTimes(1);
  });

  it('keeps task rows visible during a failed refresh and clears the error after retry', async () => {
    mocks.listTasks
      .mockReset()
      .mockResolvedValueOnce(taskPage('first', '2026-08-01'))
      .mockRejectedValueOnce(new Error('list unavailable'))
      .mockResolvedValueOnce(taskPage('retry', '2026-08-03'));
    scope = effectScope();
    const taskCenter = scope.run(() => useTaskCenter())!;

    await taskCenter.load();
    await taskCenter.load(true);
    expect(taskCenter.tasks.value[0]?.taskId).toBe('first');
    expect(taskCenter.error.value).toBe('list unavailable');

    await taskCenter.load(true);
    expect(taskCenter.tasks.value[0]?.taskId).toBe('retry');
    expect(taskCenter.error.value).toBeNull();
  });
});
