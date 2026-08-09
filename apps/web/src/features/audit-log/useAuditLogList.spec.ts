import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

const mocks = vi.hoisted(() => ({
  listAuditLogs: vi.fn(),
  messageError: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: { error: mocks.messageError }
}));

vi.mock('../../services/api', () => ({
  api: { listAuditLogs: mocks.listAuditLogs }
}));

vi.mock('../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useAuditLogList } from './useAuditLogList';
import type { AuditLogRow } from './useAuditLogDetail';

type AuditLogListPayload = {
  items: AuditLogRow[];
  total: number;
  dateFrom?: string;
  dateTo?: string;
};

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

function payload(logId: string, dateFrom = '2026-08-01'): AuditLogListPayload {
  return {
    items: [{ logId, action: `action-${logId}`, result: 'success' }],
    total: 1,
    dateFrom,
    dateTo: '2026-08-05'
  };
}

describe('audit log list request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.listAuditLogs.mockReset().mockResolvedValue(payload('default'));
    mocks.messageError.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest list and effective window when an earlier response resolves late', async () => {
    const first = createDeferred<AuditLogListPayload>();
    const second = createDeferred<AuditLogListPayload>();
    mocks.listAuditLogs
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const list = scope.run(() => useAuditLogList())!;

    const firstLoad = list.load();
    const secondLoad = list.load();
    second.resolve(payload('second', '2026-08-02'));
    await secondLoad;
    first.resolve(payload('first', '2026-08-01'));
    await firstLoad;

    expect(list.items.value[0]?.logId).toBe('second');
    expect(list.windowLabel.value).toBe('2026-08-02 ~ 2026-08-05');
    expect(list.loading.value).toBe(false);
    expect(mocks.messageError).not.toHaveBeenCalled();
  });

  it('drops late data and blocks new list reads after scope disposal', async () => {
    const pending = createDeferred<AuditLogListPayload>();
    mocks.listAuditLogs.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const list = scope.run(() => useAuditLogList())!;

    const load = list.load();
    scope.stop();
    pending.resolve(payload('late'));
    await load;
    await list.load();

    expect(list.items.value).toEqual([]);
    expect(list.listDateFrom.value).toBeUndefined();
    expect(list.listDateTo.value).toBeUndefined();
    expect(list.loading.value).toBe(false);
    expect(mocks.listAuditLogs).toHaveBeenCalledTimes(1);
  });

  it('sends the current user and date filters as one paged query', async () => {
    scope = effectScope();
    const list = scope.run(() => useAuditLogList())!;
    list.filters.userId = 'user-1';
    list.filters.dateFrom = '2026-08-03';
    list.filters.dateTo = '2026-08-05';

    await list.load();

    expect(mocks.listAuditLogs).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      userId: 'user-1',
      dateFrom: '2026-08-03',
      dateTo: '2026-08-05'
    });
  });

  it('surfaces the current list failure instead of treating the table as an empty success', async () => {
    mocks.listAuditLogs.mockReset().mockRejectedValue(new Error('审计服务不可用'));
    scope = effectScope();
    const list = scope.run(() => useAuditLogList())!;

    await list.load();

    expect(list.error.value).toBe('审计服务不可用');
    expect(list.items.value).toEqual([]);
    expect(list.loading.value).toBe(false);
    expect(mocks.messageError).toHaveBeenCalledTimes(1);
  });
});
