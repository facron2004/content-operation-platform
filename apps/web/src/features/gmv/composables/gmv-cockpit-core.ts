import { ref, type Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import {
  getGmvByMerchant,
  getGmvDistribution,
  getGmvHourly,
  getGmvToday,
  getGmvTrend,
  getGmvRefreshStatus,
  startGmvRefresh,
  type GmvDistributionRow,
  type GmvHourlyPoint,
  type GmvKpi,
  type GmvMerchantRow,
  type GmvRefreshJob,
  type GmvRefreshResult,
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
    // Live progress text for the backfill/refresh job (set by pollGmvRefreshJob).
    backfillStatusText: ref(''),
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
  statusText: Ref<string>;
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
  options.statusText.value = '准备回填…';
  options.loadError.value = null;
  try {
    // 30 天回填耗时长，期间 API 进程可能因 tsx watch 重启 / 多实例端口冲突
    // 等原因重启，导致内存中的 job 丢失（polling 404）或短暂不可达（连续失败）。
    // 这种情况下 job 本身无法恢复，但重新发起 startGmvRefresh 即可继续（JeeSite
    // 拉单 + 重算对同一区间幂等）。故在 job_lost / poll_failed 时自动重试一次。
    const MAX_ATTEMPTS = 2;
    let etlResult: GmvRefreshResult | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { jobId } = await startGmvRefresh(startDate, endDate);
        const job = await pollGmvRefreshJob(jobId, (j) => {
          options.statusText.value = describeRefreshProgress(j);
        });
        if (job.status === 'error') {
          throw new Error(job.error ?? '回填失败');
        }
        etlResult = job.result;
        if (!etlResult) throw new Error('回填任务未完成');
        break;
      } catch (err) {
        const code = (err as RefreshPollError).code;
        const isRetriable = code === 'job_lost' || code === 'poll_failed';
        if (!isRetriable || attempt >= MAX_ATTEMPTS) throw err;
        // 服务重启导致 job 丢失：自动重新发起一次回填。
        options.statusText.value = '服务重启，正在自动重新发起回填…';
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    // 循环正常退出只可能发生在某次 attempt 成功 break 之后；此处的窄化同时
    // 满足 TS（证明 etlResult 已赋值）与防御性校验。
    if (!etlResult) throw new Error('回填任务未完成');
    ElMessage.success(
      `回填完成: ${etlResult.upserted} 单 (${etlResult.pagesFetched} 页) — ${startDate} → ${endDate}`
    );
    // 直接刷新仪表盘数据（不经过 reload 的二次 JeeSite 拉取）
    // 切换到回填截止日期，让用户立即看到回填日期的数据
    options.kpiDate.value = endDate;
    await options.loadAll();
    if (etlResult.errors > 0 || etlResult.recomputeWarnings?.length) {
      ElMessage.warning(
        `回填已完成，但有 ${etlResult.errors} 条订单写入失败${
          etlResult.recomputeWarnings?.length ? '，部分汇总重算失败' : ''
        }，请检查数据完整性`
      );
    }
  } catch (err) {
    options.loadError.value = extractErrorMessage(err, '回填失败');
    ElMessage.error(options.loadError.value);
  } finally {
    options.backfilling.value = false;
    options.statusText.value = '';
  }
}

/**
 * Poll a refresh job started by startGmvRefresh until it reaches a terminal
 * state (done/error). Reports progress through onStatus so the UI can show
 * live text (e.g. "第 N 页 / 已写入 M 单"). A generous safety cap prevents an
 * orphaned job from polling forever.
 *
 * Errors carry a `code` so callers can decide whether to auto-retry:
 * - `job_lost`:   404 — job vanished from the server (process restart). The job
 *                 is gone permanently, but a fresh startGmvRefresh can resume it.
 * - `poll_failed`: too many consecutive polling failures (server unreachable).
 * - `timeout`:    polled past POLL_TIMEOUT_MS without a terminal state.
 */
export type RefreshPollErrorCode = 'job_lost' | 'poll_failed' | 'timeout';
export type RefreshPollError = Error & { code?: RefreshPollErrorCode };

function refreshPollError(message: string, code: RefreshPollErrorCode): RefreshPollError {
  const err = new Error(message) as RefreshPollError;
  err.code = code;
  return err;
}

export async function pollGmvRefreshJob(
  jobId: string,
  onStatus?: (job: GmvRefreshJob) => void
): Promise<GmvRefreshJob> {
  const startedAt = Date.now();
  const POLL_INTERVAL_MS = 1500;
  const POLL_TIMEOUT_MS = 30 * 60 * 1000;
  // 重算阶段后端可能短暂阻塞事件循环导致单次轮询超时/失败，
  // 因此单次失败不终止轮询，只有连续多次失败才判定任务不可达。
  // 30 天回填拉单+重算耗时长，期间若 API 进程重启（如 tsx watch 重启、
  // 多实例端口冲突），job 会从内存丢失。这里把连续失败阈值放宽，给
  // 进程重启留出恢复窗口；调用方（backfillGmvHistory）会在 job_lost/
  // poll_failed 时自动重新发起一次回填。
  const MAX_CONSECUTIVE_FAILURES = 20;
  let consecutiveFailures = 0;
  let job: GmvRefreshJob | null = null;
  for (;;) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw refreshPollError('回填任务轮询超时（>30 分钟），请稍后刷新页面查看结果', 'timeout');
    }
    try {
      job = await getGmvRefreshStatus(jobId);
      consecutiveFailures = 0;
      onStatus?.(job);
      if (job.status === 'done' || job.status === 'error') return job;
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      // 404 表示 job 已被服务端清理（重启等），无法恢复 —— 调用方可重新发起。
      if (status === 404) {
        throw refreshPollError('回填任务已丢失（服务可能重启过），将尝试自动重新发起', 'job_lost');
      }
      // 429 表示命中限流，但后台任务仍在正常运行——退避一次即可，不计入
      // 连续失败阈值，避免限流抖动把整轮回填误判为不可达而中断。
      if (status === 429) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS * 2));
        continue;
      }
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw refreshPollError(
          '回填任务状态多次查询失败（服务可能重启过），将尝试自动重新发起',
          'poll_failed'
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/** Human-readable one-line progress for the backfill/refresh panel. */
export function describeRefreshProgress(job: GmvRefreshJob): string {
  switch (job.status) {
    case 'queued':
      return '排队中…';
    case 'pulling':
      return `正在抓取 JeeSite 订单… 第 ${job.progress.pagesFetched} 页，已写入 ${job.progress.upserted} 单`;
    case 'recomputing':
      return '正在重算 GMV 汇总…';
    case 'finalizing':
      return '正在生成看板数据…';
    case 'done':
      return '回填完成';
    case 'error':
      return '回填失败';
    default:
      return '处理中…';
  }
}

export async function refreshGmvCockpit(options: {
  loading: Ref<boolean>;
  statusText: Ref<string>;
  loadError: Ref<string | null>;
  kpiDate: Ref<string>;
  loadAll: () => Promise<void>;
}) {
  options.loading.value = true;
  options.statusText.value = '准备刷新…';
  options.loadError.value = null;
  try {
    // 使用当前看板日期刷新，避免用户查看历史日期时只刷新了今天。
    const date = options.kpiDate.value;
    const { jobId } = await startGmvRefresh(date, date);
    const job = await pollGmvRefreshJob(jobId, (j) => {
      options.statusText.value = describeRefreshProgress(j);
    });
    if (job.status === 'error') {
      throw new Error(job.error ?? '刷新失败');
    }
    const etlResult = job.result;
    if (!etlResult) throw new Error('刷新任务未完成');
    if (etlResult.errors > 0 || etlResult.recomputeWarnings?.length) {
      ElMessage.warning(
        `刷新完成，但有 ${etlResult.errors} 条订单写入失败${
          etlResult.recomputeWarnings?.length ? '，部分汇总重算失败' : ''
        }，当前页面可能仍是旧数据`
      );
    } else if (etlResult.upserted > 0) {
      ElMessage.success(`已拉取 ${etlResult.upserted} 单 (${etlResult.pagesFetched} 页)`);
    } else {
      ElMessage.info('刷新完成，JeSite 没有返回新增订单');
    }
  } catch {
    ElMessage.warning('拉取 JeSite 失败,使用本地数据');
  }
  try {
    // 必须先拉 JeeSite 再加载本地数据——并行跑会导致 loadAll 在同步完成前看到旧汇总。
    await options.loadAll();
  } finally {
    options.loading.value = false;
    options.statusText.value = '';
  }
}
