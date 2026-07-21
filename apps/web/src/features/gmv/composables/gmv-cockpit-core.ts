import { ref, type Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import {
  getGmvByMerchant,
  getGmvDistribution,
  getGmvHourly,
  getGmvToday,
  getGmvTrend,
  refreshGmvFromJeesite,
  type GmvDistributionRow,
  type GmvHourlyPoint,
  type GmvKpi,
  type GmvMerchantRow,
  type GmvTrendPoint
} from '../../../services/api/gmv.api';
import { extractErrorMessage } from '../../../services/http-client';
import type { GmvTrendGranularity, GmvTrendMode } from './gmv-chart-ui';

export type GmvCategoryRow = {
  name: string;
  value: number;
  share: number;
  color: string;
};

export type GmvChannelRow = {
  name: string;
  value: number;
  share: number;
  color: string;
};

export type GmvFunnelStage = {
  label: string;
  value: number;
  rate: number;
  color: string;
};

export type GmvActivityRow = {
  name: string;
  dateRange: string;
  gmv: number;
  roi: number;
  verifyRate: number;
};

export type GmvHeatPoint = {
  name: string;
  value: [number, number, number];
};

export type GmvAlertItem = {
  id: string;
  region: string;
  title: string;
  time: string;
  tone: 'danger' | 'warning' | 'info';
};

export function createGmvCockpitState() {
  const todayText = beijingDateKey();
  return {
    loading: ref(false),
    loadError: ref<string | null>(null),
    kpi: ref<GmvKpi | null>(null),
    trend: ref<GmvTrendPoint[]>([]),
    hourly: ref<GmvHourlyPoint[]>([]),
    distribution: ref<GmvDistributionRow[]>([]),
    topMerchants: ref<GmvMerchantRow[]>([]),
    trendGranularity: ref<GmvTrendGranularity>('day'),
    trendMode: ref<GmvTrendMode>('volume'),
    distDim: ref<'area' | 'category'>('area'),
    merchantSort: ref<'gmvDesc' | 'refundDesc' | 'verifyDesc'>('gmvDesc'),
    todayText,
    kpiDate: ref(todayText),
    backfilling: ref(false),
    categories: ref<GmvCategoryRow[]>([]),
    channels: ref<GmvChannelRow[]>([]),
    funnel: ref<GmvFunnelStage[]>([]),
    activities: ref<GmvActivityRow[]>([]),
    heatPoints: ref<GmvHeatPoint[]>([]),
    heatCity: ref<string>('成都市'),
    alerts: ref<GmvAlertItem[]>([])
  };
}

async function loadGmvValue<T>(
  run: () => Promise<T>,
  target: Ref<T>,
  loadError: Ref<string | null>,
  fallback: string
) {
  try {
    target.value = await run();
  } catch (err) {
    loadError.value = extractErrorMessage(err, fallback);
  }
}

export const loadGmvKpis = (
  kpiDate: string,
  kpi: Ref<GmvKpi | null>,
  loadError: Ref<string | null>
) => loadGmvValue(() => getGmvToday(kpiDate, true), kpi, loadError, '加载 KPI 失败');

export const loadGmvTrend = (
  granularity: GmvTrendGranularity,
  kpiDate: string,
  trend: Ref<GmvTrendPoint[]>,
  loadError: Ref<string | null>
) => {
  const days = granularity === 'day' ? 30 : granularity === 'week' ? 90 : 365;
  return loadGmvValue(
    () => getGmvTrend(days, kpiDate, true, granularity),
    trend,
    loadError,
    '加载趋势失败'
  );
};

export const loadGmvHourly = (
  kpiDate: string,
  hourly: Ref<GmvHourlyPoint[]>,
  loadError: Ref<string | null>
) => loadGmvValue(() => getGmvHourly(kpiDate, true), hourly, loadError, '加载分时失败');

export const loadGmvDistribution = (
  dim: 'area' | 'category',
  distribution: Ref<GmvDistributionRow[]>,
  loadError: Ref<string | null>
) => loadGmvValue(() => getGmvDistribution(dim, 10, true), distribution, loadError, '加载分布失败');

export async function loadGmvTopMerchants(
  sort: 'gmvDesc' | 'refundDesc' | 'verifyDesc',
  topMerchants: Ref<GmvMerchantRow[]>,
  loadError: Ref<string | null>
) {
  try {
    topMerchants.value = (await getGmvByMerchant(sort, 1, 20, true)).items;
  } catch (err) {
    const { extractErrorMessage } = await import('../../../services/http-client');
    loadError.value = extractErrorMessage(err, '加载商家榜失败');
  }
}

export async function backfillGmvHistory(options: {
  todayText: string;
  days: number;
  backfilling: Ref<boolean>;
  loadError: Ref<string | null>;
  reload: () => Promise<void>;
}) {
  const endDate = options.todayText,
    startDate = shiftDateKey(endDate, -(options.days - 1));
  try {
    await ElMessageBox.confirm(
      `将重抓 ${startDate} → ${endDate} (${options.days} 天) 的订单到本地,并刷新所有 GMV 视图。继续?`,
      '历史回填',
      { type: 'info', confirmButtonText: '开始回填', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  options.backfilling.value = true;
  options.loadError.value = null;
  try {
    const etlResult = await refreshGmvFromJeesite(startDate, endDate);
    ElMessage.success(
      `回填完成: ${etlResult.upserted} 单 (${etlResult.pagesFetched} 页) — ${startDate} → ${endDate}`
    );
  } catch (err) {
    ElMessage.error(extractErrorMessage(err, '回填失败'));
  } finally {
    options.backfilling.value = false;
  }
  await options.reload();
}

export async function refreshGmvCockpit(options: {
  loading: Ref<boolean>;
  loadError: Ref<string | null>;
  loadAll: () => Promise<void>;
}) {
  options.loading.value = true;
  options.loadError.value = null;
  try {
    const etlResult = await refreshGmvFromJeesite();
    ElMessage.success(`已拉取 ${etlResult.upserted} 单 (${etlResult.pagesFetched} 页)`);
  } catch {
    ElMessage.warning('拉取 JeSite 失败,使用本地数据');
  }
  await options.loadAll();
  options.loading.value = false;
}
