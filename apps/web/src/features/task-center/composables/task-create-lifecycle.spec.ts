import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  batchCreateTasks: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.success,
    warning: mocks.warning,
    error: mocks.error
  }
}));

vi.mock('../../../services/api', () => ({
  api: {
    createTask: mocks.createTask,
    updateTask: mocks.updateTask,
    batchCreateTasks: mocks.batchCreateTasks
  }
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useTaskBatchCreate } from './useTaskBatchCreate';
import { useTaskForm } from './useTaskForm';

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

describe('task creation submission lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('prevents duplicate single-task submissions while the first request is pending', async () => {
    const pending = createDeferred<unknown>();
    const onSaved = vi.fn();
    mocks.createTask.mockReturnValue(pending.promise);
    scope = effectScope();
    const form = scope.run(() => useTaskForm(undefined, { onSaved }))!;
    form.open();
    form.form.groupId = 'group-1';
    form.form.packageId = 'package-1';

    const firstSubmit = form.submit();
    const duplicateSubmit = form.submit();

    expect(await duplicateSubmit).toBe(false);
    expect(mocks.createTask).toHaveBeenCalledTimes(1);
    expect(form.submitting.value).toBe(true);

    pending.resolve({});
    expect(await firstSubmit).toBe(true);
    expect(mocks.success).toHaveBeenCalledWith('任务已创建');
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(form.dialogVisible.value).toBe(false);
    expect(form.submitting.value).toBe(false);
  });

  it('suppresses late single-task feedback and callbacks after scope disposal', async () => {
    const pending = createDeferred<unknown>();
    const onSaved = vi.fn();
    mocks.createTask.mockReturnValue(pending.promise);
    scope = effectScope();
    const form = scope.run(() => useTaskForm(undefined, { onSaved }))!;
    form.open();
    form.form.groupId = 'group-1';
    form.form.packageId = 'package-1';

    const submit = form.submit();
    scope.stop();
    pending.resolve({});

    expect(await submit).toBe(false);
    expect(form.submitting.value).toBe(false);
    expect(form.dialogVisible.value).toBe(true);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    await expect(form.submit()).resolves.toBe(false);
    expect(mocks.createTask).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed single-task form open and clears the error after retry', async () => {
    mocks.createTask
      .mockRejectedValueOnce(new Error('create unavailable'))
      .mockResolvedValueOnce({});
    scope = effectScope();
    const form = scope.run(() => useTaskForm())!;
    form.open();
    form.form.groupId = 'group-1';
    form.form.packageId = 'package-1';

    expect(await form.submit()).toBe(false);
    expect(form.writeError.value).toBe('创建任务失败');
    expect(form.dialogVisible.value).toBe(true);

    expect(await form.submit()).toBe(true);
    expect(form.writeError.value).toBeNull();
    expect(form.dialogVisible.value).toBe(false);
    expect(mocks.createTask.mock.calls[0]?.[1]).toMatch(/^create-task:/);
    expect(mocks.createTask.mock.calls[1]?.[1]).toBe(mocks.createTask.mock.calls[0]?.[1]);
  });

  it('prevents duplicate batch submissions while the first request is pending', async () => {
    const pending = createDeferred<{ created: number }>();
    const onSaved = vi.fn();
    mocks.batchCreateTasks.mockReturnValue(pending.promise);
    scope = effectScope();
    const batch = scope.run(() => useTaskBatchCreate({ onSaved }))!;
    batch.rows.value[0].groupId = 'group-1';
    batch.rows.value[0].packageId = 'package-1';

    const firstSubmit = batch.submit();
    const duplicateSubmit = batch.submit();

    expect(await duplicateSubmit).toBe(false);
    expect(mocks.batchCreateTasks).toHaveBeenCalledTimes(1);
    expect(batch.submitting.value).toBe(true);

    pending.resolve({ created: 1 });
    expect(await firstSubmit).toBe(true);
    expect(mocks.success).toHaveBeenCalledWith('已批量创建 1 条任务');
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(batch.dialogVisible.value).toBe(false);
    expect(batch.submitting.value).toBe(false);
  });

  it('suppresses late batch feedback and callbacks after scope disposal', async () => {
    const pending = createDeferred<{ created: number }>();
    const onSaved = vi.fn();
    mocks.batchCreateTasks.mockReturnValue(pending.promise);
    scope = effectScope();
    const batch = scope.run(() => useTaskBatchCreate({ onSaved }))!;
    batch.open();
    batch.rows.value[0].groupId = 'group-1';
    batch.rows.value[0].packageId = 'package-1';

    const submit = batch.submit();
    scope.stop();
    pending.resolve({ created: 1 });

    expect(await submit).toBe(false);
    expect(batch.submitting.value).toBe(false);
    expect(batch.dialogVisible.value).toBe(true);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    await expect(batch.submit()).resolves.toBe(false);
    expect(mocks.batchCreateTasks).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed batch form open and clears the error after retry', async () => {
    mocks.batchCreateTasks
      .mockRejectedValueOnce(new Error('batch unavailable'))
      .mockResolvedValueOnce({ created: 1 });
    scope = effectScope();
    const batch = scope.run(() => useTaskBatchCreate())!;
    batch.open();
    batch.rows.value[0].groupId = 'group-1';
    batch.rows.value[0].packageId = 'package-1';

    expect(await batch.submit()).toBe(false);
    expect(batch.writeError.value).toBe('批量创建任务失败');
    expect(batch.dialogVisible.value).toBe(true);

    expect(await batch.submit()).toBe(true);
    expect(batch.writeError.value).toBeNull();
    expect(batch.dialogVisible.value).toBe(false);
    expect(mocks.batchCreateTasks.mock.calls[0]?.[1]).toMatch(/^batch-create-tasks:/);
    expect(mocks.batchCreateTasks.mock.calls[1]?.[1]).toBe(
      mocks.batchCreateTasks.mock.calls[0]?.[1]
    );
  });
});
