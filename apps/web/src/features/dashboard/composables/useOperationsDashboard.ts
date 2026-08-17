import { computed, onMounted, onScopeDispose, ref } from 'vue';
import type { EChartsCoreOption } from 'echarts/core';
import type { ConsoleResponse } from '@content/shared';
import { getDashboardSummary, getTodayOperationConsole } from '../../../services/api/dashboard.api';
import {
  getGmvByMerchant,
  getGmvDistribution,
  getGmvTrend
} from '../../../services/api/gmv.api';
import {
  getOperationWorkbench,
  type OperationWorkbenchResponse
} from '../../../services/api/operation-workbench.api';
import { listCommunities } from '../../../services/api/community-library.api';
import { getUserLifecycle, type UserLifecycleResponse } from '../../../services/api/user-lifecycle.api';
import { clearCache, clearDashboardCache } from '../../../services/cache.service';
import { extractErrorMessage } from '../../../services/http-client';
import { mapContentFunnelSummary } from './dashboard-summary';
import {
  mapDashboardSources,
  type DashboardDataSources
} from '../dashboard-mappers';
import {
  createEmptyDashboardData,
  DEFAULT_FILTERS,
  TIME_RANGE_OPTIONS,
  type DashboardBreakdownItem,
  type DashboardFilters,
  type DashboardPackage,
  type DashboardPackageTab,
  type DashboardTimeRange,
  type DashboardTrendMetric,
  type OperationsDashboardData
} from '../operations-dashboard';

export { TIME_RANGE_OPTIONS };
export type {
  DashboardFilters,
  DashboardPackage,
  DashboardPackageTab,
  DashboardTimeRange,
  DashboardTrendMetric
};

const TREND_LABELS: Record<DashboardTrendMetric, string> = {
  gmv: 'GMV',
  orders: '支付订单',
  verify: '核销订单',
  refund: '退款金额'
};

function formatCount(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

function formatMoney(value: number): string {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

function formatCompact(value: number, currency = false): string {
  const prefix = currency ? '¥' : '';
  if (Math.abs(value) >= 10000) return `${prefix}${(value / 10000).toFixed(1)}万`;
  return `${prefix}${Math.round(value).toLocaleString('zh-CN')}`;
}

function buildTrendOption(
  points: OperationsDashboardData['trendByRange'][DashboardTimeRange],
  metric: DashboardTrendMetric
): EChartsCoreOption {
  const values = points.map((point) => point[metric]);
  const currencyMetric = metric === 'gmv' || metric === 'refund';
  const companionMetric = metric === 'orders' ? 'verify' : 'orders';
  const companionLabel = companionMetric === 'verify' ? '核销订单' : '支付订单';
  const companionValues = points.map((point) => point[companionMetric]);
  const hasYesterday = points.some((point) => point.yesterdayGmv !== undefined);
  return {
    animationDuration: 420,
    grid: { top: 26, right: 46, bottom: 30, left: 54 },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { color: '#667085', fontSize: 11 }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1d2939',
      borderWidth: 0,
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: (params: Array<{ seriesName: string; value: number; axisValue: string }>) => {
        const first = params[0];
        if (!first) return '';
        return [
          `<strong>${first.axisValue}</strong>`,
          ...params.map(
            (item) =>
              `${item.seriesName}：${currencyMetric && item.seriesName === TREND_LABELS[metric] ? formatMoney(item.value) : formatCount(item.value)}`
          )
        ].join('<br/>');
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: true,
      data: points.map((point) => point.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e4e7ec' } },
      axisLabel: { color: '#98a2b3', fontSize: 11, margin: 12 }
    },
    yAxis: [
      {
        type: 'value',
        axisLabel: {
          color: '#98a2b3',
          fontSize: 11,
          formatter: (value: number) => formatCompact(value, currencyMetric)
        },
        splitLine: { lineStyle: { color: '#f0f2f5' } }
      },
      {
        type: 'value',
        axisLabel: {
          color: '#98a2b3',
          fontSize: 11,
          formatter: (value: number) => formatCompact(value)
        },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: TREND_LABELS[metric],
        type: 'bar',
        data: values,
        barMaxWidth: 22,
        itemStyle: { color: '#3b82f6', borderRadius: [5, 5, 0, 0] }
      },
      {
        name: companionLabel,
        type: 'line',
        yAxisIndex: 1,
        data: companionValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { width: 2, color: '#14b8a6' },
        itemStyle: { color: '#14b8a6' }
      },
      ...(metric === 'gmv' && hasYesterday
        ? [
            {
              name: '昨日',
              type: 'line' as const,
              data: points.map((point) => point.yesterdayGmv ?? null),
              smooth: true,
              symbol: 'none',
              lineStyle: { type: 'dashed' as const, width: 1.5, color: '#a8b1c0' },
              itemStyle: { color: '#a8b1c0' }
            }
          ]
        : [])
    ]
  };
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

export function useOperationsDashboard() {
  const filters = ref<DashboardFilters>({ ...DEFAULT_FILTERS });
  const baseData = ref(createEmptyDashboardData());
  const loading = ref(false);
  const dataNotice = ref('');
  const sourceLabel = ref('真实数据');
  const trendMetric = ref<DashboardTrendMetric>('gmv');
  const compositionTab = ref<'region' | 'category' | 'channel'>('region');
  const packageTab = ref<DashboardPackageTab>('hot');
  const requestId = ref(0);
  let disposed = false;

  onScopeDispose(() => {
    disposed = true;
    requestId.value += 1;
  });

  const data = computed(() => baseData.value);
  const currentTrend = computed(() => data.value.trendByRange[filters.value.timeRange]);
  const trendOption = computed(() => buildTrendOption(currentTrend.value, trendMetric.value));
  const currentBreakdown = computed<DashboardBreakdownItem[]>(
    () => data.value.breakdowns[compositionTab.value]
  );
  const currentPackages = computed(() => data.value.packages[packageTab.value]);
  const title = computed(() => data.value.title);

  function updateFilters(next: Partial<DashboardFilters>) {
    filters.value = { ...filters.value, ...next };
  }

  async function load(force = false) {
    if (disposed) return;
    const currentRequest = ++requestId.value;
    loading.value = true;
    dataNotice.value = '';
    if (force) {
      clearDashboardCache();
      clearCache('/community-library');
    }

    try {
      const [
        workbenchResult,
        consoleResult,
        trendResult,
        regionResult,
        categoryResult,
        channelResult,
        merchantsResult,
        funnelResult,
        lifecycleResult,
        communityResult
      ] = await Promise.allSettled([
        getOperationWorkbench(undefined, force),
        getTodayOperationConsole(force ? { force: true } : {}),
        getGmvTrend(30, undefined, force),
        getGmvDistribution('area', 20, force),
        getGmvDistribution('category', 20, force),
        getGmvDistribution('channel', 20, force),
        getGmvByMerchant('gmvDesc', 1, 5, force),
        getDashboardSummary(),
        getUserLifecycle({ page: 1, pageSize: 1 }),
        listCommunities({ isActive: 1, page: 1, pageSize: 100 })
      ]);

      if (disposed || currentRequest !== requestId.value) return;

      const sources: DashboardDataSources = {
        workbench: settledValue<OperationWorkbenchResponse>(workbenchResult),
        console: settledValue<ConsoleResponse>(consoleResult),
        trend: settledValue(trendResult) ?? [],
        distributions: {
          region: settledValue(regionResult)?.items,
          category: settledValue(categoryResult)?.items,
          channel: settledValue(channelResult)?.items
        },
        merchants: settledValue(merchantsResult)?.items ?? [],
        funnel: settledValue(funnelResult)
          ? mapContentFunnelSummary(settledValue(funnelResult))
          : null,
        lifecycle: settledValue<UserLifecycleResponse>(lifecycleResult),
        communities: settledValue(communityResult)
      };
      baseData.value = mapDashboardSources(sources);

      const labeledResults: Array<[string, PromiseSettledResult<unknown>]> = [
        ['经营快照', workbenchResult],
        ['运营预警', consoleResult],
        ['趋势', trendResult],
        ['区域构成', regionResult],
        ['商品类型构成', categoryResult],
        ['渠道构成', channelResult],
        ['商家排行', merchantsResult],
        ['内容漏斗', funnelResult],
        ['用户生命周期', lifecycleResult],
        ['社群', communityResult]
      ];
      const failedSources = labeledResults
        .filter(([, result]) => result.status === 'rejected')
        .map(([label]) => label);

      const hasAnySource = [
        workbenchResult,
        consoleResult,
        trendResult,
        regionResult,
        categoryResult,
        channelResult,
        merchantsResult,
        funnelResult,
        lifecycleResult,
        communityResult
      ].some((result) => result.status === 'fulfilled');
      sourceLabel.value = hasAnySource ? '真实数据' : '真实数据不可用';
      if (failedSources.length) {
        dataNotice.value = `部分真实数据源暂不可用：${failedSources.join('、')}`;
      } else if (!hasAnySource) {
        dataNotice.value = '真实数据源暂不可用，请刷新或检查当前账号的数据权限。';
      } else if (!baseData.value.kpis.length && !baseData.value.trendByRange['30d'].length) {
        dataNotice.value = '真实数据源暂无可用记录。';
      }
    } catch (error) {
      if (!disposed && currentRequest === requestId.value) {
        baseData.value = createEmptyDashboardData();
        sourceLabel.value = '真实数据不可用';
        dataNotice.value = extractErrorMessage(error, '真实数据源暂不可用，请稍后刷新。');
      }
    } finally {
      if (!disposed && currentRequest === requestId.value) loading.value = false;
    }
  }

  function refresh() {
    return load(true);
  }

  onMounted(() => void load());

  return {
    filters,
    data,
    title,
    loading,
    dataNotice,
    sourceLabel,
    trendMetric,
    compositionTab,
    packageTab,
    currentTrend,
    trendOption,
    currentBreakdown,
    currentPackages,
    updateFilters,
    load,
    refresh,
    formatCount,
    formatMoney
  };
}
