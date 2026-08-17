import { computed, onMounted, onScopeDispose, ref } from 'vue';
import type { EChartsCoreOption } from 'echarts/core';
import { getTodayOperationConsole } from '../../../services/api/dashboard.api';
import {
  getOperationWorkbench,
  type OperationWorkbenchResponse
} from '../../../services/api/operation-workbench.api';
import { extractErrorMessage } from '../../../services/http-client';
import {
  BUSINESS_OPTIONS,
  CHANNEL_OPTIONS,
  cloneDashboardData,
  DEFAULT_FILTERS,
  DEMO_DASHBOARD_DATA,
  MERCHANT_OPTIONS,
  REGION_OPTIONS,
  type DashboardBreakdownItem,
  type DashboardFilters,
  type DashboardPackage,
  type DashboardPackageTab,
  type DashboardTimeRange,
  type DashboardTrendMetric,
  type OperationsDashboardData
} from '../operations-dashboard';

export { BUSINESS_OPTIONS, CHANNEL_OPTIONS, MERCHANT_OPTIONS, REGION_OPTIONS };
export type {
  DashboardFilters,
  DashboardPackage,
  DashboardPackageTab,
  DashboardTimeRange,
  DashboardTrendMetric
};

const REGION_FACTORS: Record<string, number> = {
  全部区域: 1,
  南山区: 0.82,
  福田区: 0.7,
  龙岗区: 0.6,
  宝安区: 0.54
};

const BUSINESS_FACTORS: Record<string, number> = {
  全部业务: 1,
  福利套餐: 0.35,
  普通团购: 0.28,
  超售套餐: 0.2,
  实物商品: 0.12
};

const CHANNEL_FACTORS: Record<string, number> = {
  全部渠道: 1,
  小程序首页: 0.33,
  搜索: 0.19,
  社群: 0.18,
  企微: 0.15,
  活动页面: 0.1
};

const MERCHANT_FACTORS: Record<string, number> = {
  全部商家: 1,
  'XX 火锅': 0.2,
  'XX 烧烤': 0.16,
  'XX 茶饮': 0.14,
  'XX 自助餐': 0.1,
  'XX 烤肉': 0.08
};

const RANGE_FACTORS: Record<DashboardTimeRange, number> = {
  realtime: 0.24,
  today: 1,
  yesterday: 0.94,
  '7d': 1.06,
  '30d': 1.12
};

const TREND_LABELS: Record<DashboardTrendMetric, string> = {
  gmv: 'GMV',
  orders: '支付订单',
  verify: '核销订单',
  refund: '退款金额'
};

function numeric(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function moneyFromFenOrYuan(fen: unknown, yuan: unknown): number {
  if (fen !== null && fen !== undefined && fen !== '') {
    const value = Number(fen);
    if (Number.isFinite(value)) return value / 100;
  }
  return numeric(yuan);
}

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

function scale(value: number, factor: number): number {
  return Math.max(0, Math.round(value * factor));
}

function scaleBreakdown(items: DashboardBreakdownItem[], factor: number) {
  return items.map((item) => ({ ...item, value: scale(item.value, factor) }));
}

function projectData(
  source: OperationsDashboardData,
  filters: DashboardFilters
): OperationsDashboardData {
  const factor =
    RANGE_FACTORS[filters.timeRange] *
    REGION_FACTORS[filters.region] *
    BUSINESS_FACTORS[filters.business] *
    CHANNEL_FACTORS[filters.channel] *
    MERCHANT_FACTORS[filters.merchant];
  const data = cloneDashboardData(source);
  data.title = filters.region === '全部区域' ? '全域运营驾驶舱' : `${filters.region}运营驾驶舱`;
  data.kpis = data.kpis.map((item) => ({ ...item, value: scale(item.value, factor) }));
  data.trendByRange = Object.fromEntries(
    Object.entries(data.trendByRange).map(([range, points]) => [
      range,
      points.map((point) => ({
        ...point,
        gmv: scale(point.gmv, factor),
        orders: scale(point.orders, factor),
        verify: scale(point.verify, factor),
        refund: scale(point.refund, factor),
        yesterdayGmv: scale(point.yesterdayGmv, factor)
      }))
    ])
  ) as OperationsDashboardData['trendByRange'];
  data.funnel = data.funnel.map((stage) => ({ ...stage, value: scale(stage.value, factor) }));
  data.breakdowns = Object.fromEntries(
    Object.entries(data.breakdowns).map(([key, items]) => [key, scaleBreakdown(items, factor)])
  ) as OperationsDashboardData['breakdowns'];
  data.merchants = data.merchants.map((item) => ({
    ...item,
    gmv: scale(item.gmv, factor),
    orders: scale(item.orders, factor)
  }));
  data.packages = Object.fromEntries(
    Object.entries(data.packages).map(([key, items]) => [
      key,
      items.map((item) => ({
        ...item,
        gmv: scale(item.gmv, factor),
        sales: scale(item.sales, factor),
        remaining:
          item.remaining === undefined ? undefined : Math.max(1, scale(item.remaining, factor)),
        selloutMinutes: item.selloutMinutes
      }))
    ])
  ) as OperationsDashboardData['packages'];
  data.users = {
    ...data.users,
    stats: data.users.stats.map((item) => ({ ...item, value: scale(item.value, factor) })),
    dormantHighValue: scale(data.users.dormantHighValue, factor)
  };
  data.community = {
    ...data.community,
    stats: data.community.stats.map((item) => ({ ...item, value: scale(item.value, factor) })),
    groups: data.community.groups.map((item) => ({ ...item, gmv: scale(item.gmv, factor) }))
  };
  return data;
}

function mergeWorkbenchData(
  source: OperationsDashboardData,
  workbench: OperationWorkbenchResponse
) {
  const data = cloneDashboardData(source);
  const gmv = workbench.kpis?.gmv;
  const hasLiveNumbers = Boolean(
    gmv &&
    (moneyFromFenOrYuan(gmv.totalGmvFen, gmv.totalGmv) > 0 || numeric(gmv.paidOrderCount) > 0)
  );
  if (!hasLiveNumbers) return { data, hasLiveNumbers: false };

  const liveKpis = new Map([
    ['gmv', moneyFromFenOrYuan(gmv.totalGmvFen, gmv.totalGmv)],
    ['orders', numeric(gmv.paidOrderCount)],
    ['verify', numeric(gmv.paidOrderCount) * numeric(gmv.verifyRate)],
    ['refund', moneyFromFenOrYuan(gmv.totalRefundFen, gmv.totalRefund)]
  ]);
  data.kpis = data.kpis.map((item) => {
    const nextValue = liveKpis.get(item.key);
    return nextValue === undefined || nextValue <= 0 ? item : { ...item, value: nextValue };
  });

  if (Array.isArray(workbench.trend) && workbench.trend.length > 1) {
    const liveTrend = workbench.trend.map((point) => {
      const gmvValue = moneyFromFenOrYuan(point.totalGmvFen, point.totalGmv);
      return {
        label: point.date.slice(5),
        gmv: gmvValue,
        orders: numeric(point.paidOrderCount),
        verify: numeric(point.paidOrderCount) * numeric(gmv.verifyRate),
        refund: gmvValue * numeric(gmv.refundRate),
        yesterdayGmv: gmvValue * 0.92
      };
    });
    data.trendByRange.today = liveTrend;
    data.trendByRange.realtime = liveTrend;
    data.trendByRange['7d'] = liveTrend;
  }
  data.updatedAt = workbench.updatedAt ? `实时快照 · ${workbench.updatedAt}` : '实时快照';
  return { data, hasLiveNumbers: true };
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
      ...(metric === 'gmv' && points.length <= 12
        ? [
            {
              name: '昨日',
              type: 'line' as const,
              data: points.map((point) => point.yesterdayGmv),
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

export function useOperationsDashboard() {
  const filters = ref<DashboardFilters>({ ...DEFAULT_FILTERS });
  const baseData = ref(cloneDashboardData(DEMO_DASHBOARD_DATA));
  const loading = ref(false);
  const dataNotice = ref('当前展示方案演示数据；连接实时源后会自动替换经营指标。');
  const sourceLabel = ref('方案演示数据');
  const trendMetric = ref<DashboardTrendMetric>('gmv');
  const compositionTab = ref<'region' | 'category' | 'channel'>('region');
  const packageTab = ref<DashboardPackageTab>('hot');
  const requestId = ref(0);
  let disposed = false;

  onScopeDispose(() => {
    disposed = true;
    requestId.value += 1;
  });

  const data = computed(() => projectData(baseData.value, filters.value));
  const currentTrend = computed(() => data.value.trendByRange[filters.value.timeRange]);
  const trendOption = computed(() => buildTrendOption(currentTrend.value, trendMetric.value));
  const currentBreakdown = computed(() => data.value.breakdowns[compositionTab.value]);
  const currentPackages = computed(() => data.value.packages[packageTab.value]);
  const title = computed(() => data.value.title);

  function updateFilters(next: Partial<DashboardFilters>) {
    filters.value = { ...filters.value, ...next };
  }

  async function load() {
    if (disposed) return;
    const currentRequest = ++requestId.value;
    loading.value = true;
    dataNotice.value = '';
    try {
      const [workbenchResult, consoleResult] = await Promise.allSettled([
        getOperationWorkbench(),
        getTodayOperationConsole()
      ]);
      if (disposed || currentRequest !== requestId.value) return;

      const workbench =
        workbenchResult.status === 'fulfilled'
          ? (workbenchResult.value as OperationWorkbenchResponse)
          : null;
      const merged = workbench ? mergeWorkbenchData(baseData.value, workbench) : null;
      if (merged?.hasLiveNumbers) {
        baseData.value = merged.data;
        sourceLabel.value = '实时经营快照';
        dataNotice.value =
          consoleResult.status === 'rejected'
            ? '核心经营指标已连接实时源，部分异常与社群信息暂用方案样例。'
            : '';
      } else {
        sourceLabel.value = '方案演示数据';
        dataNotice.value = '当前未获得实时经营快照，页面保留完整方案演示数据供体验。';
      }
      if (workbenchResult.status === 'rejected' && consoleResult.status === 'rejected') {
        dataNotice.value = extractErrorMessage(workbenchResult.reason, dataNotice.value);
      }
    } catch (error) {
      if (!disposed && currentRequest === requestId.value) {
        sourceLabel.value = '方案演示数据';
        dataNotice.value = extractErrorMessage(error, '实时经营源暂不可用，当前保留方案演示数据。');
      }
    } finally {
      if (!disposed && currentRequest === requestId.value) loading.value = false;
    }
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
    formatCount,
    formatMoney
  };
}
