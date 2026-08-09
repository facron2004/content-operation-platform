import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

const mocks = vi.hoisted(() => ({
  getAuditLog: vi.fn(),
  messageWarning: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: { warning: mocks.messageWarning }
}));

vi.mock('../../services/api', () => ({
  api: { getAuditLog: mocks.getAuditLog }
}));

vi.mock('../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useAuditLogDetail, type AuditLogRow } from './useAuditLogDetail';

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

function row(logId: string): AuditLogRow {
  return { logId, action: `action-${logId}`, result: 'success' };
}

describe('audit log detail request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.getAuditLog.mockReset().mockResolvedValue(null);
    mocks.messageWarning.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest detail when an earlier response resolves late', async () => {
    const first = createDeferred<AuditLogRow>();
    const second = createDeferred<AuditLogRow>();
    mocks.getAuditLog
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const detail = scope.run(() => useAuditLogDetail())!;

    const firstLoad = detail.showDetail(row('first'));
    const secondLoad = detail.showDetail(row('second'));
    second.resolve(row('second-full'));
    await secondLoad;
    first.resolve(row('first-full'));
    await firstLoad;

    expect(detail.selectedLog.value?.logId).toBe('second-full');
    expect(detail.detailLoading.value).toBe(false);
    expect(mocks.messageWarning).not.toHaveBeenCalled();
  });

  it('drops late data and feedback after the dialog closes', async () => {
    const pending = createDeferred<AuditLogRow>();
    mocks.getAuditLog.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const detail = scope.run(() => useAuditLogDetail())!;

    const load = detail.showDetail(row('closing'));
    detail.onDetailClosed();
    pending.reject(new Error('late detail failure'));
    await load;

    expect(detail.selectedLog.value).toBeNull();
    expect(detail.detailLoading.value).toBe(false);
    expect(detail.detailError.value).toBeNull();
    expect(mocks.messageWarning).not.toHaveBeenCalled();
  });

  it('surfaces the current detail failure and clears it after a successful retry', async () => {
    mocks.getAuditLog
      .mockReset()
      .mockRejectedValueOnce(new Error('detail unavailable'))
      .mockResolvedValueOnce(row('retry-full'));
    scope = effectScope();
    const detail = scope.run(() => useAuditLogDetail())!;

    await detail.showDetail(row('retry'));

    expect(detail.selectedLog.value?.logId).toBe('retry');
    expect(detail.detailError.value).toBe('加载审计详情失败');

    await detail.showDetail(row('retry'));

    expect(detail.selectedLog.value?.logId).toBe('retry-full');
    expect(detail.detailError.value).toBeNull();
  });

  it('drops late data and blocks new detail reads after scope disposal', async () => {
    const pending = createDeferred<AuditLogRow>();
    mocks.getAuditLog.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const detail = scope.run(() => useAuditLogDetail())!;
    const load = detail.showDetail(row('disposed'));

    scope.stop();
    pending.resolve(row('late'));
    await load;
    await detail.showDetail(row('after-dispose'));

    expect(detail.selectedLog.value).toBeNull();
    expect(detail.detailLoading.value).toBe(false);
    expect(mocks.getAuditLog).toHaveBeenCalledTimes(1);
  });
});
