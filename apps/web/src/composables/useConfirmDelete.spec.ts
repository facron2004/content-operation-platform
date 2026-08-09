import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.success,
    error: mocks.error
  },
  ElMessageBox: {
    confirm: mocks.confirm
  }
}));

vi.mock('../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { confirmAndDelete } from './useConfirmDelete';

describe('confirmAndDelete lifecycle', () => {
  beforeEach(() => {
    mocks.confirm.mockReset().mockResolvedValue(undefined);
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  it('suppresses late success feedback after the owner becomes inactive', async () => {
    let resolveDelete!: () => void;
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    let active = true;
    const onSuccess = vi.fn();
    const operation = confirmAndDelete({ message: '确认删除？' }, () => deletePromise, {
      successMsg: '已删除',
      isActive: () => active,
      onSuccess
    });

    active = false;
    resolveDelete();

    await expect(operation).resolves.toBe(false);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('suppresses late failure feedback after the owner becomes inactive', async () => {
    let rejectDelete!: (error: unknown) => void;
    const deletePromise = new Promise<void>((_, reject) => {
      rejectDelete = reject;
    });
    let active = true;
    const onError = vi.fn();
    const operation = confirmAndDelete({ message: '确认删除？' }, () => deletePromise, {
      errorMsg: '删除失败',
      isActive: () => active,
      onError
    });

    active = false;
    rejectDelete(new Error('late failure'));

    await expect(operation).resolves.toBe(false);
    expect(mocks.error).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not open confirmation after the owner becomes inactive', async () => {
    const onSuccess = vi.fn();

    await expect(
      confirmAndDelete({ message: '确认删除？' }, vi.fn(), {
        isActive: () => false,
        onSuccess
      })
    ).resolves.toBe(false);

    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
