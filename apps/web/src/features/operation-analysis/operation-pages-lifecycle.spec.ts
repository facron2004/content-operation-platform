import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

const mocks = vi.hoisted(() => ({
  getGmvToday: vi.fn(),
  getGmvTrend: vi.fn(),
  getGmvDistribution: vi.fn(),
  getGmvByMerchant: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: () => undefined };
});

vi.mock('../../services/api/gmv.api', () => ({
  getGmvToday: mocks.getGmvToday,
  getGmvTrend: mocks.getGmvTrend,
  getGmvDistribution: mocks.getGmvDistribution,
  getGmvByMerchant: mocks.getGmvByMerchant
}));

vi.mock('../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useOperationAnalysis } from './useOperationAnalysis';
import { useOperationAlerts } from '../operation-alerts/useOperationAlerts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function distribution(key: string) {
  return {
    items: [{ key, totalGmvFen: '100', share: 1 }],
    limit: 20,
    matched: 1,
    truncated: false
  };
}

describe('operation center read lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.getGmvToday.mockReset().mockResolvedValue({
      paidOrderCount: 0,
      refundRate: 0,
      verifyRate: 0
    });
    mocks.getGmvTrend.mockReset().mockResolvedValue([]);
    mocks.getGmvDistribution.mockReset().mockResolvedValue({
      items: [],
      limit: 20,
      matched: 0,
      truncated: false
    });
    mocks.getGmvByMerchant.mockReset().mockResolvedValue({
      items: [],
      hasMore: false,
      limit: 1000,
      truncated: false
    });
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('uses cached analysis reads for normal browsing and force only for manual reload', async () => {
    scope = effectScope();
    const analysis = scope.run(() =>
      useOperationAnalysis({ name: 'operation-analysis', query: {} } as never)
    )!;
    const date = analysis.kpiDate.value;

    await analysis.reload();
    expect(mocks.getGmvToday).toHaveBeenLastCalledWith(date, false);
    expect(mocks.getGmvTrend).toHaveBeenLastCalledWith(30, date, false, 'day');
    expect(mocks.getGmvDistribution).toHaveBeenLastCalledWith('area', 20, false, date);
    expect(analysis.visibleShare.value).toBe('—');

    await analysis.reload(true);
    expect(mocks.getGmvToday).toHaveBeenLastCalledWith(date, true);
    expect(mocks.getGmvTrend).toHaveBeenLastCalledWith(30, date, true, 'day');
    expect(mocks.getGmvDistribution).toHaveBeenLastCalledWith('area', 20, true, date);

    analysis.onDimensionChange('category');
    await vi.waitFor(() =>
      expect(mocks.getGmvDistribution).toHaveBeenLastCalledWith('category', 20, false, date)
    );

    analysis.onDateChange('2026-08-10');
    await vi.waitFor(() => expect(mocks.getGmvToday).toHaveBeenLastCalledWith('2026-08-10', false));
  });

  it('does not let an earlier area reload overwrite a later category selection', async () => {
    const area = deferred<ReturnType<typeof distribution>>();
    const category = deferred<ReturnType<typeof distribution>>();
    mocks.getGmvDistribution
      .mockReset()
      .mockReturnValueOnce(area.promise)
      .mockReturnValueOnce(category.promise);
    scope = effectScope();
    const analysis = scope.run(() =>
      useOperationAnalysis({ name: 'operation-analysis', query: {} } as never)
    )!;

    const pendingReload = analysis.reload();
    analysis.onDimensionChange('category');
    expect(analysis.distribution.value).toEqual([]);
    await vi.waitFor(() => expect(mocks.getGmvDistribution).toHaveBeenCalledTimes(2));
    category.resolve(distribution('新类目'));
    await vi.waitFor(() => expect(analysis.distribution.value[0]?.key).toBe('新类目'));
    area.resolve(distribution('旧区域'));
    await pendingReload;

    expect(analysis.dimension.value).toBe('category');
    expect(analysis.distribution.value[0]?.key).toBe('新类目');
  });

  it('forces only the first merchant page on manual alert reload and exposes a clipped scope', async () => {
    mocks.getGmvByMerchant.mockImplementation(
      (_sort: string, page: number, _pageSize: number, _force: boolean) =>
        Promise.resolve({
          items: [
            {
              merchantId: `merchant-${page}`,
              merchantName: `商家 ${page}`,
              areaName: null,
              refundRate: 0,
              verifyRate: 1,
              paidOrderCount: 1
            }
          ],
          hasMore: page === 1,
          limit: 1000,
          truncated: true
        })
    );
    scope = effectScope();
    const alerts = scope.run(() => useOperationAlerts())!;
    const date = alerts.kpiDate.value;

    await alerts.load();
    expect(mocks.getGmvToday).toHaveBeenLastCalledWith(date, false);
    expect(mocks.getGmvByMerchant).toHaveBeenNthCalledWith(1, 'gmvDesc', 1, 100, false, date);
    expect(mocks.getGmvByMerchant).toHaveBeenNthCalledWith(2, 'gmvDesc', 2, 100, false, date);

    mocks.getGmvByMerchant.mockClear();
    await alerts.load(true);
    expect(mocks.getGmvToday).toHaveBeenLastCalledWith(date, true);
    expect(mocks.getGmvByMerchant).toHaveBeenNthCalledWith(1, 'gmvDesc', 1, 100, true, date);
    expect(mocks.getGmvByMerchant).toHaveBeenNthCalledWith(2, 'gmvDesc', 2, 100, false, date);
    expect(alerts.merchantTruncated.value).toBe(true);
    expect(alerts.merchantLimit.value).toBe(1000);
    expect(alerts.merchants.value).toHaveLength(2);
  });
});
