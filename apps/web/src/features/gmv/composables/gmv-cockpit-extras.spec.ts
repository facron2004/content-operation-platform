import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GmvKpi } from '../../../services/api/gmv.api';
import type {
  GmvActivityRow,
  GmvAlertItem,
  GmvCategoryRow,
  GmvChannelRow,
  GmvFunnelStage,
  GmvHeatPoint
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

import { loadGmvCockpitExtras } from './gmv-cockpit-extras';

function distributionRow(key: string, totalGmv: number) {
  return {
    key,
    totalGmv,
    gmvOnline: totalGmv,
    gmvWallet: 0,
    gmvBonus: 0,
    share: 1
  };
}

function createParams() {
  return {
    kpi: ref<GmvKpi | null>(null),
    extrasError: ref<string | null>(null),
    categories: ref<GmvCategoryRow[]>([{ name: '旧品类', value: 12, share: 1, color: '#2e90fa' }]),
    channels: ref<GmvChannelRow[]>([]),
    funnel: ref<GmvFunnelStage[]>([]),
    activities: ref<GmvActivityRow[]>([]),
    heatPoints: ref<GmvHeatPoint[]>([{ name: '旧区域', value: [0, 0, 1] }]),
    heatCity: ref('旧区域热力'),
    alerts: ref<GmvAlertItem[]>([])
  };
}

describe('GMV cockpit auxiliary distribution lifecycle', () => {
  beforeEach(() => {
    mocks.getGmvDistribution.mockReset();
  });

  it('surfaces a failed auxiliary request while preserving its previous chart data', async () => {
    mocks.getGmvDistribution.mockImplementation((dim: string) =>
      dim === 'category'
        ? Promise.reject(new Error('category unavailable'))
        : Promise.resolve({
            items: [distributionRow('华东', 240)],
            limit: 20,
            matched: 1,
            truncated: false
          })
    );
    const params = createParams();

    await loadGmvCockpitExtras(params);

    expect(params.extrasError.value).toBe('品类分布：加载品类分布失败');
    expect(params.categories.value).toEqual([
      { name: '旧品类', value: 12, share: 1, color: '#2e90fa' }
    ]);
    expect(params.heatPoints.value[0]?.name).toBe('华东');
  });

  it('clears the auxiliary error and replaces preserved data after a successful retry', async () => {
    mocks.getGmvDistribution.mockImplementation((dim: string) =>
      Promise.resolve({
        items: [distributionRow(dim === 'category' ? '新类目' : '华南', 180)],
        limit: 20,
        matched: 1,
        truncated: false
      })
    );
    const params = createParams();
    params.extrasError.value = '上一次辅助图表失败';

    await loadGmvCockpitExtras(params);

    expect(params.extrasError.value).toBeNull();
    expect(params.categories.value[0]?.name).toBe('新类目');
    expect(params.heatPoints.value[0]?.name).toBe('华南');
  });
});
