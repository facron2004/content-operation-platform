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
    // Residual #230: top-merchants pagination (API returns hasMore; SPA used page=1 only).
    merchantPage: ref(1),
    merchantPageSize: ref(20),
    merchantHasMore: ref(false),
    // Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty.
    merchantTruncated: ref(false),
    merchantLimit: ref<number | null>(null),
    // Residual #289: GMV distribution Top-N honesty.
    distributionTruncated: ref(false),
    distributionLimit: ref<number | null>(null),
    distributionMatched: ref<number | null>(null),
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
    // 超时 / 连接失败 / 限流时页面降级为空态即可，不展示错误横幅
    const axiosErr = err as { code?: string; response?: { status?: number } };
    if (axiosErr.code === 'ECONNABORTED' || !axiosErr.response || axiosErr.response.status === 429)
      return;
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
  // Interactive GMV trend shares the 90d money-read cap (API rejects 365).
  const days = granularity === 'day' ? 30 : 90;
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

export async function loadGmvDistribution(
  dim: 'area' | 'category',
  distribution: Ref<GmvDistributionRow[]>,
  loadError: Ref<string | null>,
  // Residual #289: optional honesty sinks for Top-N distribution head.
  distributionTruncated?: Ref<boolean>,
  distributionLimit?: Ref<number | null>,
  distributionMatched?: Ref<number | null>
) {
  try {
    const payload = await getGmvDistribution(dim, 10, true);
    distribution.value = payload.items ?? [];
    if (distributionTruncated) distributionTruncated.value = Boolean(payload.truncated);
    if (distributionLimit) {
      distributionLimit.value =
        typeof payload.limit === 'number' && Number.isFinite(payload.limit) ? payload.limit : null;
    }
    if (distributionMatched) {
      distributionMatched.value =
        typeof payload.matched === 'number' && Number.isFinite(payload.matched)
          ? payload.matched
          : null;
    }
  } catch (err) {
    const axiosErr = err as { code?: string; response?: { status?: number } };
    if (axiosErr.code === 'ECONNABORTED' || !axiosErr.response || axiosErr.response.status === 429)
      return;
    loadError.value = extractErrorMessage(err, '加载分布失败');
  }
}

export async function loadGmvTopMerchants(params: {
  sort: 'gmvDesc' | 'refundDesc' | 'verifyDesc';
  page: number;
  pageSize: number;
  topMerchants: Ref<GmvMerchantRow[]>;
  hasMore: Ref<boolean>;
  // Residual #265: optional honesty sinks.
  truncated?: Ref<boolean>;
  limit?: Ref<number | null>;
  loadError: Ref<string | null>;
}) {
  try {
    // Residual #230: honor page/pageSize + hasMore from API.
    const result = await getGmvByMerchant(params.sort, params.page, params.pageSize, true);
    params.topMerchants.value = result.items;
    params.hasMore.value = !!result.hasMore;
    // Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty.
    if (params.truncated) params.truncated.value = Boolean(result.truncated);
    if (params.limit) {
      params.limit.value =
        typeof result.limit === 'number' && Number.isFinite(result.limit) ? result.limit : null;
    }
  } catch (err) {
    const { extractErrorMessage } = await import('../../../services/http-client');
    const axiosErr = err as { code?: string; response?: { status?: number } };
    if (axiosErr.code === 'ECONNABORTED' || !axiosErr.response || axiosErr.response.status === 429)
      return;
    params.loadError.value = extractErrorMessage(err, '加载商家榜失败');
  }
}

export async function backfillGmvHistory(options: {
  todayText: string;
  days: number;
  backfilling: Ref<boolean>;
  loadError: Ref<string | null>;
  kpiDate: Ref<string>;
  loadAll: () => Promise<void>;
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
    // 直接刷新仪表盘数据（不经过 reload 的二次 JeeSite 拉取）
    await options.loadAll();
    // 切换到回填截止日期，让用户立即看到回填日期的数据
    options.kpiDate.value = endDate;
  } catch (err) {
    options.loadError.value = extractErrorMessage(err, '回填失败');
    ElMessage.error(options.loadError.value);
  } finally {
    options.backfilling.value = false;
  }
}

export async function refreshGmvCockpit(options: {
  loading: Ref<boolean>;
  loadError: Ref<string | null>;
  loadAll: () => Promise<void>;
}) {
  options.loading.value = true;
  options.loadError.value = null;
  // 先加载本地数据（快），同时后台拉取 JeeSite（可能慢/超时），不互相阻塞
  const [etlResult] = await Promise.allSettled([refreshGmvFromJeesite(), options.loadAll()]);
  if (etlResult.status === 'fulfilled') {
    ElMessage.success(`已拉取 ${etlResult.value.upserted} 单 (${etlResult.value.pagesFetched} 页)`);
  } else {
    ElMessage.warning('拉取 JeSite 失败,使用本地数据');
  }
  options.loading.value = false;
}
