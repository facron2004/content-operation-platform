import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { TaskDetailResponse, TaskPerformanceResponse } from '@content/shared';

const mocks = vi.hoisted(() => ({
  getTask: vi.fn(),
  getTaskPerformance: vi.fn(),
  publishTask: vi.fn(),
  failTask: vi.fn(),
  cancelTask: vi.fn(),
  reassignTask: vi.fn(),
  scheduleTask: vi.fn(),
  completeTask: vi.fn(),
  success: vi.fn(),
  error: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: { success: mocks.success, error: mocks.error }
}));

vi.mock('../../../services/api', () => ({
  api: {
    getTask: mocks.getTask,
    getTaskPerformance: mocks.getTaskPerformance,
    publishTask: mocks.publishTask,
    failTask: mocks.failTask,
    cancelTask: mocks.cancelTask,
    reassignTask: mocks.reassignTask,
    scheduleTask: mocks.scheduleTask,
    completeTask: mocks.completeTask
  }
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useTaskDetail } from './useTaskDetail';

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

function detailFor(taskId: string, title: string, assigneeName?: string): TaskDetailResponse {
  return {
    taskId,
    packageId: 'package-1',
    channel: 'wechat_group',
    title,
    status: 'scheduled',
    priority: 'normal',
    assigneeName,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    executions: []
  };
}

function performanceFor(visits: number): TaskPerformanceResponse {
  return {
    visits,
    orders: 2,
    gmv: 300,
    verifyRate: 0.5,
    refundRate: 0.1,
    conversionRate: 0.2,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-05'
  };
}

describe('useTaskDetail request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getTaskPerformance.mockResolvedValue(null);
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('ignores late detail data and blocks new reads after scope disposal', async () => {
    const pending = createDeferred<TaskDetailResponse>();
    mocks.getTask.mockReturnValue(pending.promise);
    scope = effectScope();
    const detail = scope.run(() => useTaskDetail('task-1'))!;

    const load = detail.loadDetail();
    scope.stop();
    pending.resolve(detailFor('task-1', 'late'));
    await load;
    await detail.loadDetail();

    expect(detail.task.value).toBeNull();
    expect(detail.loading.value).toBe(false);
    expect(mocks.getTask).toHaveBeenCalledTimes(1);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('keeps the latest detail response when an earlier load resolves late', async () => {
    const first = createDeferred<TaskDetailResponse>();
    const second = createDeferred<TaskDetailResponse>();
    mocks.getTask
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const detail = scope.run(() => useTaskDetail('task-1'))!;

    const firstLoad = detail.loadDetail();
    const secondLoad = detail.loadDetail();
    second.resolve(detailFor('task-1', 'latest'));
    await secondLoad;
    first.resolve(detailFor('task-1', 'stale'));
    await firstLoad;

    expect(detail.task.value?.title).toBe('latest');
    expect(detail.loading.value).toBe(false);
  });

  it('surfaces primary detail failure and clears it after a successful retry', async () => {
    mocks.getTask
      .mockReset()
      .mockRejectedValueOnce(new Error('detail unavailable'))
      .mockResolvedValueOnce(detailFor('task-1', 'retried'));
    scope = effectScope();
    const detail = scope.run(() => useTaskDetail('task-1'))!;

    await detail.loadDetail();
    expect(detail.task.value).toBeNull();
    expect(detail.loadError.value).toBe('加载任务详情失败');

    await detail.loadDetail();
    expect(detail.task.value?.title).toBe('retried');
    expect(detail.loadError.value).toBeNull();
  });

  it('keeps task detail visible when performance fails and clears the error after retry', async () => {
    mocks.getTask.mockReset().mockResolvedValue(detailFor('task-1', 'stable detail'));
    mocks.getTaskPerformance
      .mockReset()
      .mockRejectedValueOnce(new Error('performance unavailable'))
      .mockResolvedValueOnce(performanceFor(12));
    scope = effectScope();
    const detail = scope.run(() => useTaskDetail('task-1'))!;

    await detail.loadDetail();
    expect(detail.task.value?.title).toBe('stable detail');
    expect(detail.performance.value).toBeNull();
    expect(detail.performanceError.value).toBe('加载任务表现失败');

    await detail.loadDetail();
    expect(detail.performance.value?.visits).toBe(12);
    expect(detail.performanceError.value).toBeNull();
  });

  it('keeps mutation failures visible and returns success only after a retry succeeds', async () => {
    mocks.publishTask
      .mockRejectedValueOnce(new Error('publish unavailable'))
      .mockResolvedValueOnce({});
    mocks.getTask.mockResolvedValue(detailFor('task-1', 'published'));
    scope = effectScope();
    const detail = scope.run(() => useTaskDetail('task-1'))!;
    detail.task.value = detailFor('task-1', 'scheduled');

    await expect(detail.publish({ note: 'publish' })).resolves.toBe(false);
    expect(detail.actionError.value).toBe('发布任务失败');
    expect(mocks.error).toHaveBeenCalledWith('发布任务失败');

    await expect(detail.publish({ note: 'retry' })).resolves.toBe(true);
    expect(detail.actionError.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith('任务已发布');
  });

  it('keeps a successful mutation successful when the follow-up detail refresh fails', async () => {
    mocks.publishTask.mockResolvedValue({});
    mocks.getTask.mockRejectedValue(new Error('refresh unavailable'));
    scope = effectScope();
    const detail = scope.run(() => useTaskDetail('task-1'))!;
    detail.task.value = detailFor('task-1', 'scheduled');

    await expect(detail.publish({ note: 'publish' })).resolves.toBe(true);

    expect(detail.actionError.value).toBe('刷新任务详情失败');
    expect(mocks.success).toHaveBeenCalledWith('任务已发布');
    expect(mocks.error).toHaveBeenCalledWith('刷新任务详情失败');
  });

  it('preserves status mutation refresh and ignores a stale mutation', async () => {
    mocks.publishTask.mockResolvedValue({});
    mocks.getTask.mockResolvedValue(detailFor('task-1', 'published'));
    scope = effectScope();
    const detail = scope.run(() => useTaskDetail('task-1'))!;
    detail.task.value = detailFor('task-1', 'scheduled');

    await detail.publish({ note: 'publish' });

    expect(mocks.publishTask).toHaveBeenCalledWith(
      'task-1',
      { note: 'publish' },
      '2026-08-05T00:00:00.000Z'
    );
    expect(mocks.getTask).toHaveBeenCalledTimes(1);
    expect(detail.task.value?.title).toBe('published');
    expect(mocks.success).toHaveBeenCalledWith('任务已发布');

    const stale = createDeferred<unknown>();
    const latest = createDeferred<TaskDetailResponse>();
    mocks.publishTask.mockReturnValue(stale.promise);
    mocks.reassignTask.mockReturnValue(latest.promise);
    const stalePublish = detail.publish({ note: 'stale' });
    const latestReassign = detail.reassign({ assigneeId: 'user-2' });
    latest.resolve(detailFor('task-1', 'reassigned', 'User 2'));
    await latestReassign;
    stale.resolve({});
    await stalePublish;

    expect(detail.task.value?.title).toBe('reassigned');
    expect(detail.task.value?.assigneeName).toBe('User 2');
    expect(mocks.success).toHaveBeenCalledTimes(2);
    expect(mocks.success).toHaveBeenLastCalledWith('任务已重新分配');
  });

  it('does not publish late mutation feedback or refresh after disposal', async () => {
    const pending = createDeferred<unknown>();
    mocks.publishTask.mockReturnValue(pending.promise);
    scope = effectScope();
    const detail = scope.run(() => useTaskDetail('task-1'))!;
    detail.task.value = detailFor('task-1', 'scheduled');

    const publish = detail.publish({ note: 'late' });
    scope.stop();
    pending.resolve({});
    await publish;
    await detail.reassign({ assigneeId: 'user-2' });

    expect(mocks.publishTask).toHaveBeenCalledTimes(1);
    expect(mocks.reassignTask).not.toHaveBeenCalled();
    expect(mocks.getTask).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
