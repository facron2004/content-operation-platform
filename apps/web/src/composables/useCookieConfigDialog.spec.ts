import { effectScope } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCookieStatus: vi.fn(),
  updateCookie: vi.fn(),
  success: vi.fn(),
  warning: vi.fn()
}));

vi.mock('../services/api', () => ({ api: mocks }));
vi.mock('../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));
vi.mock('element-plus', () => ({
  ElMessage: { success: mocks.success, warning: mocks.warning }
}));

import { useCookieConfigDialog } from './useCookieConfigDialog';

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

describe('useCookieConfigDialog', () => {
  let scope: ReturnType<typeof effectScope> | undefined;

  beforeEach(() => {
    mocks.getCookieStatus.mockReset().mockResolvedValue({ isValid: true });
    mocks.updateCookie.mockReset();
    mocks.success.mockReset();
    mocks.warning.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('refreshes on open without starting a second permanent status poller', async () => {
    vi.useFakeTimers();
    try {
      let dialog!: ReturnType<typeof useCookieConfigDialog>;
      scope = effectScope();
      scope.run(() => {
        dialog = useCookieConfigDialog(vi.fn());
      });

      await dialog.onOpen();
      expect(mocks.getCookieStatus).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(mocks.getCookieStatus).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the latest status refresh when opens overlap', async () => {
    const first = createDeferred<{ isValid: boolean }>();
    const second = createDeferred<{ isValid: boolean }>();
    mocks.getCookieStatus
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const dialog = scope.run(() => useCookieConfigDialog(vi.fn()))!;

    const firstOpen = dialog.onOpen();
    const secondOpen = dialog.onOpen();
    second.resolve({ isValid: false });
    await secondOpen;
    first.resolve({ isValid: true });
    await firstOpen;

    expect(dialog.cookieStatus.value).toEqual({ isValid: false });
  });

  it('surfaces status read failures and clears the error after a successful retry', async () => {
    mocks.getCookieStatus
      .mockReset()
      .mockRejectedValueOnce(new Error('status unavailable'))
      .mockResolvedValueOnce({ isValid: true });
    scope = effectScope();
    const dialog = scope.run(() => useCookieConfigDialog(vi.fn()))!;

    await dialog.onOpen();

    expect(dialog.cookieStatus.value).toBeNull();
    expect(dialog.statusError.value).toBe('读取数据源连接状态失败，请稍后重试');

    await dialog.onOpen();

    expect(dialog.cookieStatus.value).toEqual({ isValid: true });
    expect(dialog.statusError.value).toBeNull();
  });

  it('keeps a rejected cookie save visible until a retry succeeds', async () => {
    mocks.updateCookie
      .mockRejectedValueOnce(new Error('update unavailable'))
      .mockResolvedValueOnce({ success: true });
    scope = effectScope();
    const dialog = scope.run(() => useCookieConfigDialog(vi.fn()))!;
    dialog.newCookieString.value = 'cookie-at-submit';

    await dialog.saveCookie();

    expect(dialog.saveError.value).toBe('更新失败，请稍后重试');
    expect(dialog.updatingCookie.value).toBe(false);

    await dialog.saveCookie();

    expect(dialog.saveError.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith('Cookie 更新成功，连接已恢复！');
  });

  it('keeps an explicit cookie update failure visible until a retry succeeds', async () => {
    mocks.updateCookie
      .mockResolvedValueOnce({ success: false, error: 'Cookie 已失效' })
      .mockResolvedValueOnce({ success: true });
    scope = effectScope();
    const dialog = scope.run(() => useCookieConfigDialog(vi.fn()))!;
    dialog.newCookieString.value = 'cookie-at-submit';

    await dialog.saveCookie();

    expect(dialog.saveError.value).toBe('Cookie 已失效');
    expect(dialog.updatingCookie.value).toBe(false);

    await dialog.saveCookie();

    expect(dialog.saveError.value).toBeNull();
  });

  it('blocks duplicate saves and keeps the submitted cookie snapshot', async () => {
    const pending = createDeferred<{ success: true }>();
    mocks.updateCookie.mockReturnValue(pending.promise);
    const emit = vi.fn();
    scope = effectScope();
    const dialog = scope.run(() => useCookieConfigDialog(emit))!;
    dialog.newCookieString.value = ' cookie-at-submit ';

    const firstSave = dialog.saveCookie();
    dialog.newCookieString.value = 'edited-after-submit';
    await dialog.saveCookie();

    expect(mocks.updateCookie).toHaveBeenCalledTimes(1);
    expect(mocks.updateCookie).toHaveBeenCalledWith('cookie-at-submit');
    expect(dialog.updatingCookie.value).toBe(true);

    pending.resolve({ success: true });
    await firstSave;

    expect(emit).toHaveBeenCalledWith('update:visible', false);
    expect(dialog.updatingCookie.value).toBe(false);
    expect(mocks.getCookieStatus).toHaveBeenCalledTimes(1);
  });

  it('drops late status and save results after scope disposal', async () => {
    const pendingStatus = createDeferred<{ isValid: boolean }>();
    const pendingSave = createDeferred<{ success: true }>();
    mocks.getCookieStatus.mockReturnValue(pendingStatus.promise);
    mocks.updateCookie.mockReturnValue(pendingSave.promise);
    const emit = vi.fn();
    scope = effectScope();
    const dialog = scope.run(() => useCookieConfigDialog(emit))!;
    const open = dialog.onOpen();
    dialog.newCookieString.value = 'cookie-at-submit';
    const save = dialog.saveCookie();

    scope.stop();
    pendingStatus.resolve({ isValid: false });
    pendingSave.resolve({ success: true });
    await Promise.all([open, save]);
    await dialog.onOpen();
    await dialog.saveCookie();

    expect(dialog.cookieStatus.value).toBeNull();
    expect(dialog.statusError.value).toBeNull();
    expect(dialog.updatingCookie.value).toBe(false);
    expect(emit).not.toHaveBeenCalled();
    expect(mocks.getCookieStatus).toHaveBeenCalledTimes(1);
    expect(mocks.updateCookie).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
