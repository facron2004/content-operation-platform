import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

const mocks = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
  success: vi.fn(),
  error: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.success,
    error: mocks.error
  }
}));
vi.mock('../../../utils/clipboard', () => ({
  copyTextToClipboard: mocks.copyTextToClipboard
}));

import { useTaskIdClipboard } from './useTaskIdClipboard';

describe('Task ID clipboard lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.copyTextToClipboard.mockReset();
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps a failed copy visible until a retry succeeds', async () => {
    mocks.copyTextToClipboard.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    scope = effectScope();
    const state = scope.run(() => useTaskIdClipboard())!;

    await state.copyTaskId('task-1');
    expect(state.copyError.value).toBe('复制任务 ID 失败，请手动复制');
    expect(mocks.error).toHaveBeenCalledWith('复制任务 ID 失败，请手动复制');

    await state.copyTaskId('task-1');
    expect(state.copyError.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith('任务 ID 已复制');
  });

  it('suppresses late copy feedback after scope disposal', async () => {
    let resolveCopy!: (value: boolean) => void;
    const pending = new Promise<boolean>((resolve) => {
      resolveCopy = resolve;
    });
    mocks.copyTextToClipboard.mockReturnValue(pending);
    scope = effectScope();
    const state = scope.run(() => useTaskIdClipboard())!;
    const copy = state.copyTaskId('task-1');

    scope.stop();
    resolveCopy(true);
    await copy;

    expect(state.copyError.value).toBeNull();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
