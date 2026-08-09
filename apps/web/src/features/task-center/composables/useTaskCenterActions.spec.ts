import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { DistributionTask } from '@content/shared';

const mocks = vi.hoisted(() => ({
  publishTask: vi.fn(),
  scheduleTask: vi.fn(),
  completeTask: vi.fn(),
  cancelTask: vi.fn(),
  success: vi.fn(),
  prompt: vi.fn(),
  confirm: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: { success: mocks.success },
  ElMessageBox: { prompt: mocks.prompt, confirm: mocks.confirm }
}));

vi.mock('../../../services/api', () => ({
  api: {
    publishTask: mocks.publishTask,
    scheduleTask: mocks.scheduleTask,
    completeTask: mocks.completeTask,
    cancelTask: mocks.cancelTask
  }
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback
}));

import { useTaskCenterActions } from './useTaskCenterActions';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function task(taskId: string): DistributionTask {
  return {
    taskId,
    packageId: 'package-1',
    channel: 'wechat_group',
    status: 'scheduled',
    priority: 'normal',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z'
  };
}

describe('useTaskCenterActions request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('blocks duplicate publish confirmation and refreshes once', async () => {
    const pending = createDeferred<unknown>();
    const refresh = vi.fn();
    mocks.publishTask.mockReturnValue(pending.promise);
    scope = effectScope();
    const actions = scope.run(() => useTaskCenterActions({ refresh }))!;

    actions.handlePublish(task('task-1'));
    const data = { note: 'first' };
    const first = actions.confirmPublish(data);
    data.note = 'changed after submit';
    const duplicate = actions.confirmPublish({ note: 'duplicate' });

    expect(mocks.publishTask).toHaveBeenCalledTimes(1);
    expect(mocks.publishTask).toHaveBeenCalledWith(
      'task-1',
      { note: 'first' },
      '2026-08-05T00:00:00.000Z'
    );
    pending.resolve({});
    await first;
    await duplicate;

    expect(mocks.success).toHaveBeenCalledWith('任务发布成功');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(actions.publishSubmitting.value).toBe(false);
  });

  it('surfaces publish failure and clears it after a successful retry', async () => {
    const refresh = vi.fn();
    mocks.publishTask
      .mockRejectedValueOnce(new Error('发布被服务端拒绝'))
      .mockResolvedValueOnce({});
    scope = effectScope();
    const actions = scope.run(() => useTaskCenterActions({ refresh }))!;

    actions.handlePublish(task('task-1'));
    await actions.confirmPublish({ note: 'first attempt' });

    expect(actions.actionError.value).toBe('发布被服务端拒绝');
    expect(actions.publishSubmitting.value).toBe(false);
    expect(refresh).not.toHaveBeenCalled();

    await actions.confirmPublish({ note: 'retry' });

    expect(actions.actionError.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith('任务发布成功');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('suppresses a publish result after the dialog switches to another task', async () => {
    const pending = createDeferred<unknown>();
    const refresh = vi.fn();
    mocks.publishTask.mockReturnValue(pending.promise);
    scope = effectScope();
    const actions = scope.run(() => useTaskCenterActions({ refresh }))!;

    actions.handlePublish(task('task-1'));
    const first = actions.confirmPublish({ note: 'old task' });
    actions.handlePublish(task('task-2'));
    pending.resolve({});
    await first;

    expect(mocks.success).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(actions.publishDialogVisible.value).toBe(true);
    expect(actions.publishSubmitting.value).toBe(false);
  });

  it('prevents duplicate row prompts for the same task and trims the request value', async () => {
    const prompt = createDeferred<{ value: string }>();
    const refresh = vi.fn();
    mocks.prompt.mockReturnValue(prompt.promise);
    mocks.cancelTask.mockResolvedValue({});
    scope = effectScope();
    const actions = scope.run(() => useTaskCenterActions({ refresh }))!;

    const first = actions.handleCancel(task('task-1'));
    const duplicate = actions.handleCancel(task('task-1'));
    expect(mocks.prompt).toHaveBeenCalledTimes(1);

    prompt.resolve({ value: '  duplicate-safe reason  ' });
    await first;
    await duplicate;

    expect(mocks.cancelTask).toHaveBeenCalledWith('task-1', { reason: 'duplicate-safe reason' });
    expect(mocks.success).toHaveBeenCalledWith('任务已取消');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not treat a dismissed prompt as an API error and clears row errors on retry', async () => {
    const refresh = vi.fn();
    mocks.prompt
      .mockRejectedValueOnce(new Error('user dismissed'))
      .mockResolvedValue({ value: '  retry reason  ' });
    mocks.cancelTask.mockRejectedValueOnce(new Error('取消被服务端拒绝')).mockResolvedValueOnce({});
    scope = effectScope();
    const actions = scope.run(() => useTaskCenterActions({ refresh }))!;

    await actions.handleCancel(task('task-1'));
    expect(actions.actionError.value).toBeNull();
    expect(mocks.cancelTask).not.toHaveBeenCalled();

    await actions.handleCancel(task('task-1'));
    expect(actions.actionError.value).toBe('取消被服务端拒绝');

    await actions.handleCancel(task('task-1'));
    expect(actions.actionError.value).toBeNull();
    expect(mocks.cancelTask).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('routes schedule and complete through separate row-action keys', async () => {
    const refresh = vi.fn();
    mocks.prompt.mockResolvedValue({ value: ' 2026-08-06T10:00:00 ' });
    mocks.confirm.mockResolvedValue({ value: '' });
    mocks.scheduleTask.mockResolvedValue({});
    mocks.completeTask.mockResolvedValue({});
    scope = effectScope();
    const actions = scope.run(() => useTaskCenterActions({ refresh }))!;

    await actions.handleSchedule(task('task-1'));
    await actions.handleComplete(task('task-1'));

    expect(mocks.scheduleTask).toHaveBeenCalledWith('task-1', {
      plannedAt: '2026-08-06T10:00:00'
    });
    expect(mocks.completeTask).toHaveBeenCalledWith('task-1');
    expect(mocks.success).toHaveBeenNthCalledWith(1, '任务已排期');
    expect(mocks.success).toHaveBeenNthCalledWith(2, '任务已完成');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('suppresses a late row mutation after scope disposal and blocks new work', async () => {
    const prompt = createDeferred<{ value: string }>();
    const pending = createDeferred<unknown>();
    const refresh = vi.fn();
    mocks.prompt.mockReturnValue(prompt.promise);
    mocks.cancelTask.mockReturnValue(pending.promise);
    scope = effectScope();
    const actions = scope.run(() => useTaskCenterActions({ refresh }))!;

    const cancel = actions.handleCancel(task('task-1'));
    prompt.resolve({ value: 'late reason' });
    await Promise.resolve();
    scope.stop();
    pending.resolve({});
    await cancel;
    await actions.handleCancel(task('task-1'));

    expect(mocks.cancelTask).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
