import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GmvKpi } from '../../../services/api/gmv.api';
import type {
  GmvAlertItem,
  GmvCategoryRow,
  GmvChannelRow,
  GmvFunnelStage
} from './gmv-cockpit-core';

const mocks = vi.hoisted(() => ({
  getGmvDistribution: vi.fn()
}));

vi.mock('../../../services/api/gmv.api', () => ({
  getGmvDistribution: mocks.getGmvDistribution
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import {
  loadGmvCockpitExtras,
  mapAlertsFromKpi,
  mapCategoryRows,
  mapFunnelFromKpi,
  mapPaymentChannelRows
} from './gmv-cockpit-extras';

function distributionRow(key: string, totalGmvFen: string | number) {
  return {
    key,
    totalGmvFen: String(totalGmvFen),
    gmvOnlineFen: String(totalGmvFen),
    gmvWalletFen: '0',
    gmvBonusFen: '0',
    share: 1
  };
}

function createParams() {
  return {
    date: '2026-08-10',
    kpi: ref<GmvKpi | null>(null),
    extrasError: ref<string | null>(null),
    categories: ref<GmvCategoryRow[]>([{ name: '旧品类', value: 12, share: 1, color: '#2e90fa' }]),
    channels: ref<GmvChannelRow[]>([]),
    funnel: ref<GmvFunnelStage[]>([]),
    alerts: ref<GmvAlertItem[]>([])
  };
}

describe('GMV cockpit auxiliary distribution lifecycle', () => {
  beforeEach(() => {
    mocks.getGmvDistribution.mockReset();
  });

  it('surfaces a failed auxiliary request while preserving its previous chart data', async () => {
    mocks.getGmvDistribution.mockRejectedValue(new Error('category unavailable'));
    const params = createParams();

    await loadGmvCockpitExtras(params);

    expect(params.extrasError.value).toBe('品类分布：加载品类分布失败');
    expect(params.categories.value).toEqual([
      { name: '旧品类', value: 12, share: 1, color: '#2e90fa' }
    ]);
  });

  it('clears the auxiliary error and replaces preserved data after a successful retry', async () => {
    mocks.getGmvDistribution.mockResolvedValue({
      items: [distributionRow('新类目', 180)],
      limit: 20,
      matched: 1,
      truncated: false
    });
    const params = createParams();
    params.extrasError.value = '上一次辅助图表失败';

    await loadGmvCockpitExtras(params);

    expect(params.extrasError.value).toBeNull();
    expect(params.categories.value[0]?.name).toBe('新类目');
  });

  it('keeps fen-only distribution rows visible and converts them to yuan', async () => {
    mocks.getGmvDistribution.mockResolvedValue({
      items: [distributionRow('美食', '9068996')],
      limit: 20,
      matched: 1,
      truncated: false
    });
    const params = createParams();

    await loadGmvCockpitExtras(params);

    expect(params.categories.value[0]).toMatchObject({ name: '美食', value: 90689.96 });
    expect(mocks.getGmvDistribution).toHaveBeenCalledWith('category', 8, true, '2026-08-10');
    expect(mocks.getGmvDistribution).toHaveBeenCalledTimes(1);
  });
});

describe('GMV cockpit metric presentation', () => {
  it('keeps signed, zero, and uncategorized net GMV rows for exact reconciliation', () => {
    const rows = mapCategoryRows([
      { ...distributionRow('美食', 10_000), share: 1.05 },
      { ...distributionRow('未分类', 0), share: 0 },
      { ...distributionRow('其他', -500), share: -0.05 }
    ]);

    expect(rows.map((row) => [row.name, row.value, row.share])).toEqual([
      ['美食', 100, 1.05],
      ['未分类', 0, 0],
      ['其他', -5, -0.05]
    ]);
    expect(rows[2]?.color).toBe('#d92d20');
    expect(rows.reduce((sum, row) => sum + row.value, 0)).toBe(95);
  });

  it('reconciles payment composition to net GMV and excludes non-GMV bonus points', () => {
    const rows = mapPaymentChannelRows({
      totalGmvFen: '1000',
      gmvOnlineFen: '700',
      gmvWalletFen: '300',
      gmvBonusFen: '500'
    } as GmvKpi);

    expect(rows.map((row) => row.name)).toEqual(['现金支付', '余额支付']);
    expect(rows.reduce((total, row) => total + row.value, 0)).toBe(10);
    expect(rows.map((row) => row.share)).toEqual([0.7, 0.3]);
  });

  it('labels fulfillment and refund rates independently instead of as funnel deltas', () => {
    const stages = mapFunnelFromKpi({
      totalGmvFen: '10000',
      totalVerifyFen: '6500',
      totalRefundFen: '800',
      verifyRate: 0.6,
      refundRate: 0.1
    } as GmvKpi);

    expect(stages.map((stage) => [stage.label, stage.rateLabel])).toEqual([
      ['净 GMV', '基准'],
      ['核销金额', '核销单率'],
      ['退款金额', '退款单率']
    ]);
  });

  it('timestamps derived alerts from the source data instead of the browser clock', () => {
    const updatedAt = '2026-08-10T00:30:00.000Z';
    const sourceTime = new Date(updatedAt);
    const expected = `${String(sourceTime.getHours()).padStart(2, '0')}:${String(sourceTime.getMinutes()).padStart(2, '0')}`;
    const alerts = mapAlertsFromKpi({
      updatedAt,
      refundRate: 0.08,
      verifyRate: 0.9,
      compare: {}
    } as GmvKpi);

    expect(alerts[0]?.time).toBe(expected);
  });
});
