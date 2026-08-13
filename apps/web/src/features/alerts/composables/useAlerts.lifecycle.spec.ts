import { effectScope, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearAlertCache: vi.fn(),
  error: vi.fn(),
  getAlerts: vi.fn(),
  recordError: vi.fn(),
  recordSuccess: vi.fn(),
  resolveAlerts: vi.fn(),
  success: vi.fn(),
  warning: vi.fn()
}));

vi.mock('../../../services/api', () => ({
  api: {
    getAlerts: mocks.getAlerts,
    resolveAlerts: mocks.resolveAlerts
  }
}));
vi.mock('../../../services/cache.service', () => ({ clearAlertCache: mocks.clearAlertCache }));
vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: () => 'request failed'
}));
vi.mock('../../../services/operation-history', () => ({
  useOperationHistory: () => ({
    recordError: mocks.recordError,
    recordSuccess: mocks.recordSuccess
  })
}));
vi.mock('element-plus', () => ({
  ElMessage: {
    error: mocks.error,
    success: mocks.success,
    warning: mocks.warning
  }
}));

import { useAlerts } from './useAlerts';

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

function alertResponse() {
  return {
    items: [],
    summary: {
      totalCount: 0,
      activeCount: 0,
      resolvedCount: 0,
      dangerCount: 0,
      warningCount: 0,
      infoCount: 0,
      packageCount: 0,
      typeDistribution: {}
    },
    topPackages: [],
    pagination: { page: 1, pageSize: 80, total: 0, totalPages: 0 }
  };
}

describe('useAlerts request lifecycle', () => {
  beforeEach(() => {
    mocks.clearAlertCache.mockReset();
    mocks.error.mockReset();
    mocks.getAlerts.mockReset();
    mocks.recordError.mockReset();
    mocks.recordSuccess.mockReset();
    mocks.resolveAlerts.mockReset();
    mocks.success.mockReset();
    mocks.warning.mockReset();
  });

  it('drops late list data and blocks new loads after scope disposal', async () => {
    const pending = createDeferred<ReturnType<typeof alertResponse>>();
    mocks.getAlerts.mockReturnValue(pending.promise);
    const scope = effectScope();
    let alerts!: ReturnType<typeof useAlerts>;
    scope.run(() => {
      alerts = useAlerts(ref('operator'), ref(true));
    });

    const firstLoad = alerts.load();
    scope.stop();
    pending.resolve(alertResponse());
    await firstLoad;
    await alerts.load(true);
    await alerts.handlePageChange();

    expect(mocks.getAlerts).toHaveBeenCalledTimes(1);
    expect(alerts.alerts.value).toEqual([]);
    expect(alerts.loading.value).toBe(false);
  });

  it('drops late resolve feedback and blocks new resolves after scope disposal', async () => {
    const pending = createDeferred<void>();
    mocks.resolveAlerts.mockReturnValue(pending.promise);
    const scope = effectScope();
    let alerts!: ReturnType<typeof useAlerts>;
    scope.run(() => {
      alerts = useAlerts(ref('operator'), ref(true));
    });

    const firstResolve = alerts.resolve('alert-1');
    scope.stop();
    pending.resolve();
    await firstResolve;
    await alerts.resolve('alert-1');

    expect(mocks.resolveAlerts).toHaveBeenCalledTimes(1);
    expect(alerts.resolving.value).toBe(false);
    expect(alerts.actionError.value).toBeNull();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.recordSuccess).not.toHaveBeenCalled();
    expect(mocks.recordError).not.toHaveBeenCalled();
  });

  it('keeps resolve failures visible until a retry succeeds', async () => {
    mocks.getAlerts.mockResolvedValue(alertResponse());
    mocks.resolveAlerts
      .mockRejectedValueOnce(new Error('resolve unavailable'))
      .mockResolvedValueOnce(undefined);
    const scope = effectScope();
    let alerts!: ReturnType<typeof useAlerts>;
    scope.run(() => {
      alerts = useAlerts(ref('operator'), ref(true));
    });

    await alerts.resolve('alert-1');
    expect(alerts.actionError.value).toBe('request failed');
    expect(mocks.error).toHaveBeenCalledWith('request failed');
    expect(mocks.recordError).toHaveBeenCalledTimes(1);

    await alerts.resolve('alert-1');
    expect(alerts.actionError.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith('已标记处理，今日不会再进入待办');

    scope.stop();
  });

  it('does not issue a resolve request when the session lacks write permission', async () => {
    const scope = effectScope();
    let alerts!: ReturnType<typeof useAlerts>;
    scope.run(() => {
      alerts = useAlerts(ref('auditor'), ref(false));
    });

    await alerts.resolve('PKG-1:high_refund');

    expect(mocks.resolveAlerts).not.toHaveBeenCalled();
    expect(alerts.resolving.value).toBe(false);
    scope.stop();
  });

  it('marks an explicit refresh so the API can bypass its server caches', async () => {
    mocks.getAlerts.mockResolvedValue(alertResponse());
    const scope = effectScope();
    let alerts!: ReturnType<typeof useAlerts>;
    scope.run(() => {
      alerts = useAlerts(ref('admin'), ref(true));
    });

    await alerts.load(true);

    expect(mocks.clearAlertCache).toHaveBeenCalled();
    expect(mocks.getAlerts).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    scope.stop();
  });
});
