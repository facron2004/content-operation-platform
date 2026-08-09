import { ElMessage, ElMessageBox } from 'element-plus';
import type { Ref } from 'vue';
import { shiftDateKey } from '@content/shared';
import {
  getGmvRefreshStatus,
  startGmvRefresh,
  type GmvRefreshJob,
  type GmvRefreshResult
} from '../../../services/api/gmv.api';
import { extractErrorMessage } from '../../../services/http-client';
import { createIntentVersion } from '../../../services/idempotency-key';
import type { GmvRequestGuard } from './gmv-cockpit-core';

export type RefreshPollErrorCode = 'job_lost' | 'poll_failed' | 'timeout' | 'cancelled';
export type RefreshPollError = Error & { code?: RefreshPollErrorCode };

function refreshPollError(message: string, code: RefreshPollErrorCode): RefreshPollError {
  const err = new Error(message) as RefreshPollError;
  err.code = code;
  return err;
}

function refreshWarningSummary(result: GmvRefreshResult): string | null {
  const warnings: string[] = [];
  if (result.pullWarnings?.length) warnings.push('JeSite 拉单未完成，已使用本地数据重算');
  if (result.errors > 0) warnings.push(`${result.errors} 条订单写入失败`);
  if (result.recomputeWarnings?.length) warnings.push('部分汇总重算失败');
  return warnings.length ? warnings.join('，') : null;
}

export async function backfillGmvHistory(options: {
  todayText: string;
  /** 快捷范围：重抓最近 N 天（endDate 默认今天）。与 startDate/endDate 互斥，二选一。 */
  days?: number;
  /** 按日期回填：回填 [startDate, endDate] 区间（可单日）。优先级高于 days。 */
  startDate?: string;
  endDate?: string;
  backfilling: Ref<boolean>;
  statusText: Ref<string>;
  loadError: Ref<string | null>;
  kpiDate: Ref<string>;
  loadAll: () => Promise<void>;
  isCurrent?: GmvRequestGuard;
}) {
  const isCurrent = options.isCurrent ?? (() => true);
  if (!isCurrent() || options.backfilling.value) return;
  // 按日期回填优先；否则按“最近 N 天”快捷范围（默认到今天）。
  const rangeEnd = options.endDate ?? options.todayText;
  const rangeStart = options.startDate ?? shiftDateKey(rangeEnd, -((options.days ?? 1) - 1));
  const rangeLabel =
    options.startDate && options.endDate && options.startDate === options.endDate
      ? `${rangeStart} 当天`
      : `${rangeStart} → ${rangeEnd}`;
  try {
    await ElMessageBox.confirm(
      `将重抓 ${rangeLabel} 的订单到本地,并刷新所有 GMV 视图。继续?`,
      '历史回填',
      { type: 'info', confirmButtonText: '开始回填', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  if (!isCurrent()) return;
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
    let sourceVersion = createIntentVersion();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { jobId } = await startGmvRefresh(rangeStart, rangeEnd, sourceVersion);
        const job = await pollGmvRefreshJob(
          jobId,
          (j) => {
            if (isCurrent()) options.statusText.value = describeRefreshProgress(j);
          },
          isCurrent
        );
        if (job.status === 'interrupted') {
          throw refreshPollError(
            job.error ?? '服务重启，回填任务已中断，将尝试自动重新发起',
            'job_lost'
          );
        }
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
        if (!isCurrent()) return;
        if (code === 'job_lost') sourceVersion = createIntentVersion();
        // 服务重启导致 job 丢失：自动重新发起一次回填。
        options.statusText.value = '服务重启，正在自动重新发起回填…';
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!isCurrent()) return;
      }
    }
    // 循环正常退出只可能发生在某次 attempt 成功 break 之后；此处的窄化同时
    // 满足 TS（证明 etlResult 已赋值）与防御性校验。
    if (!etlResult) throw new Error('回填任务未完成');
    if (!isCurrent()) return;
    const warningSummary = refreshWarningSummary(etlResult);
    if (warningSummary) {
      ElMessage.warning(`回填完成，但${warningSummary}，请检查数据完整性`);
    } else {
      ElMessage.success(
        `回填完成: ${etlResult.upserted} 单 (${etlResult.pagesFetched} 页) — ${rangeStart} → ${rangeEnd}`
      );
    }
    // 直接刷新仪表盘数据（不经过 reload 的二次 JeeSite 拉取）
    // 切换到回填截止日期，让用户立即看到回填日期的数据
    options.kpiDate.value = rangeEnd;
    await options.loadAll();
  } catch (err) {
    if (!isCurrent() || (err as RefreshPollError).code === 'cancelled') return;
    options.loadError.value = extractErrorMessage(err, '回填失败');
    ElMessage.error(options.loadError.value);
  } finally {
    if (isCurrent()) {
      options.backfilling.value = false;
      options.statusText.value = '';
    }
  }
}

/**
 * Poll a refresh job started by startGmvRefresh until it reaches a terminal
 * state (done/error/interrupted). Reports progress through onStatus so the UI can show
 * live text (e.g. "第 N 页 / 已写入 M 单"). A generous safety cap prevents an
 * orphaned job from polling forever.
 *
 * Errors carry a `code` so callers can decide whether to auto-retry:
 * - `job_lost`:   404 or an interrupted JobRun — the previous process stopped;
 *                 a fresh startGmvRefresh can resume the idempotent operation.
 * - `poll_failed`: too many consecutive polling failures (server unreachable).
 * - `timeout`:    polled past POLL_TIMEOUT_MS without a terminal state.
 */
export async function pollGmvRefreshJob(
  jobId: string,
  onStatus?: (job: GmvRefreshJob) => void,
  isCurrent: GmvRequestGuard = () => true
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
    if (!isCurrent()) {
      throw refreshPollError('回填任务轮询已取消', 'cancelled');
    }
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw refreshPollError('回填任务轮询超时（>30 分钟），请稍后刷新页面查看结果', 'timeout');
    }
    try {
      job = await getGmvRefreshStatus(jobId);
      if (!isCurrent()) {
        throw refreshPollError('回填任务轮询已取消', 'cancelled');
      }
      consecutiveFailures = 0;
      onStatus?.(job);
      if (job.status === 'done' || job.status === 'error' || job.status === 'interrupted') {
        return job;
      }
    } catch (err) {
      if (!isCurrent()) {
        throw refreshPollError('回填任务轮询已取消', 'cancelled');
      }
      const status = (err as { response?: { status?: number } }).response?.status;
      // 404 表示 job 已被服务端清理（重启等），无法恢复 —— 调用方可重新发起。
      if (status === 404) {
        throw refreshPollError('回填任务已丢失（服务可能重启过），将尝试自动重新发起', 'job_lost');
      }
      // 429 表示命中限流，但后台任务仍在正常运行——退避一次即可，不计入
      // 连续失败阈值，避免限流抖动把整轮回填误判为不可达而中断。
      if (status === 429) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS * 2));
        if (!isCurrent()) {
          throw refreshPollError('回填任务轮询已取消', 'cancelled');
        }
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
    case 'interrupted':
      return '服务重启，回填任务已中断，准备重试';
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
  isCurrent?: GmvRequestGuard;
}) {
  const isCurrent = options.isCurrent ?? (() => true);
  if (!isCurrent()) return;
  options.loading.value = true;
  options.statusText.value = '准备刷新…';
  options.loadError.value = null;
  try {
    // 使用当前看板日期刷新，避免用户查看历史日期时只刷新了今天。
    const date = options.kpiDate.value;
    const { jobId } = await startGmvRefresh(date, date, createIntentVersion());
    const job = await pollGmvRefreshJob(
      jobId,
      (j) => {
        if (isCurrent()) options.statusText.value = describeRefreshProgress(j);
      },
      isCurrent
    );
    if (!isCurrent()) return;
    if (job.status === 'error' || job.status === 'interrupted') {
      throw new Error(job.error ?? '刷新失败');
    }
    const etlResult = job.result;
    if (!etlResult) throw new Error('刷新任务未完成');
    const warningSummary = refreshWarningSummary(etlResult);
    if (warningSummary) {
      ElMessage.warning(`刷新完成，但${warningSummary}，当前页面可能仍是旧数据`);
    } else if (etlResult.upserted > 0) {
      ElMessage.success(`已拉取 ${etlResult.upserted} 单 (${etlResult.pagesFetched} 页)`);
    } else {
      ElMessage.info('刷新完成，JeSite 没有返回新增订单');
    }
  } catch {
    if (isCurrent()) ElMessage.warning('拉取 JeSite 失败,使用本地数据');
  }
  if (!isCurrent()) return;
  try {
    // 必须先拉 JeeSite 再加载本地数据——并行跑会导致 loadAll 在同步完成前看到旧汇总。
    await options.loadAll();
  } finally {
    if (isCurrent()) {
      options.loading.value = false;
      options.statusText.value = '';
    }
  }
}
