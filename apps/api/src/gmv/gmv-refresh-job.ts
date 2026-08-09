/**
 * Async GMV refresh job registry.
 *
 * The JeeSite pull + money recompute for a wide date range (e.g. 30 days) can
 * take well over a minute. Running it inside the HTTP request caused the SPA to
 * hit its 120s axios timeout and report "请求超时" even though the work would
 * eventually finish. This module decouples the HTTP lifecycle from the work:
 * POST /gmv/refresh returns a jobId immediately and the heavy work runs in the
 * background; the client polls GET /gmv/refresh/:jobId for progress/result.
 */
import { Logger } from '@nestjs/common';
import { AutoLoginService } from '../content/auto-login.service';
import type { JobRunRecord, JobRunnerRunOptions } from '../jobs/job-runner.service';
import { MerchantSalesService } from '../merchant-sales/merchant-sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { GmvRefreshResult, refreshGmvFromJeesite, type JeesitePullProgress } from './gmv-refresh';

export type GmvRefreshJobStatus =
  'queued' | 'pulling' | 'recomputing' | 'finalizing' | 'done' | 'error' | 'interrupted';

export interface GmvRefreshJob {
  jobId: string;
  status: GmvRefreshJobStatus;
  startDate: string;
  endDate: string;
  progress: JeesitePullProgress;
  /** Present once status === 'done'. */
  result?: GmvRefreshResult & { kpi?: unknown };
  /** Present once status === 'error'. */
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type GmvRefreshJobMetaSetter = (meta: Record<string, unknown>) => void;

export interface GmvRefreshJobRunner {
  runJob(
    jobName: string,
    jobFn: (setMeta: GmvRefreshJobMetaSetter) => Promise<number | void>,
    initialMeta?: Record<string, unknown>,
    options?: JobRunnerRunOptions
  ): Promise<void>;
  findLatestByMeta?(
    jobName: string,
    metaKey: string,
    metaValue: string
  ): Promise<JobRunRecord | null>;
}

export interface GmvRefreshJobDeps {
  prisma: PrismaService;
  autoLogin?: AutoLoginService;
  getMerchantSalesService: () => Promise<MerchantSalesService | null>;
  invalidateCache: () => void;
  getKpis: (date: string) => Promise<unknown>;
  jobRunner?: GmvRefreshJobRunner;
}

const logger = new Logger('GmvRefreshJob');
const jobs = new Map<string, GmvRefreshJob>();
const MAX_JOBS = 64;

export function getGmvRefreshJob(jobId: string): GmvRefreshJob | undefined {
  return jobs.get(jobId);
}

function parseJobMeta(metaJson: string | null): Record<string, unknown> {
  if (!metaJson) return {};
  try {
    const parsed: unknown = JSON.parse(metaJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readString(meta: Record<string, unknown>, key: string): string | undefined {
  return typeof meta[key] === 'string' && meta[key] ? meta[key] : undefined;
}

function readNumber(meta: Record<string, unknown>, key: string): number {
  const value = typeof meta[key] === 'number' ? meta[key] : Number(meta[key]);
  return Number.isFinite(value) ? value : 0;
}

function readWarnings(
  meta: Record<string, unknown>,
  key: 'pullWarnings' | 'recomputeWarnings'
): string[] {
  const value = meta[key];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  const count = readNumber(meta, `${key}Count`) || readNumber(meta, key);
  return count > 0 ? [`${key}=${count}`] : [];
}

function readPhase(meta: Record<string, unknown>): GmvRefreshJobStatus | undefined {
  const phase = meta.phase;
  return phase === 'pulling' || phase === 'recomputing' || phase === 'finalizing'
    ? phase
    : undefined;
}

function parseTimestamp(value: string | null): number {
  const timestamp = Date.parse(value?.replace(' ', 'T') ?? '');
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

/** Convert a persisted JobRun into the public polling shape after a restart. */
export function restoreGmvRefreshJob(jobId: string, run: JobRunRecord): GmvRefreshJob | undefined {
  const meta = parseJobMeta(run.metaJson);
  const startDate = readString(meta, 'startDate');
  const endDate = readString(meta, 'endDate');
  if (!startDate || !endDate) return undefined;

  const progress = {
    pagesFetched: readNumber(meta, 'pagesFetched'),
    fetched: readNumber(meta, 'fetched'),
    upserted: readNumber(meta, 'upserted'),
    skipped: readNumber(meta, 'skipped'),
    errors: readNumber(meta, 'errors')
  };
  const status: GmvRefreshJobStatus =
    run.status === 'success'
      ? 'done'
      : run.status === 'failed'
        ? 'error'
        : run.status === 'interrupted'
          ? 'interrupted'
          : (readPhase(meta) ?? 'pulling');
  const result =
    run.status === 'success'
      ? {
          startDate,
          endDate,
          fetched: progress.fetched,
          upserted: progress.upserted,
          skipped: progress.skipped,
          errors: progress.errors,
          pagesFetched: progress.pagesFetched,
          pullWarnings: readWarnings(meta, 'pullWarnings'),
          recomputeWarnings: readWarnings(meta, 'recomputeWarnings')
        }
      : undefined;

  return {
    jobId,
    status,
    startDate,
    endDate,
    progress,
    result,
    error:
      status === 'error' || status === 'interrupted'
        ? (run.errorMessage ?? (status === 'interrupted' ? '服务重启，回填任务已中断' : '回填失败'))
        : undefined,
    createdAt: parseTimestamp(run.startedAt),
    updatedAt: parseTimestamp(run.finishedAt ?? run.startedAt)
  };
}

/** Restore a GMV job from JobRun when the process-local registry was lost. */
export async function getPersistedGmvRefreshJob(
  jobId: string,
  runner?: GmvRefreshJobRunner
): Promise<GmvRefreshJob | undefined> {
  if (!runner?.findLatestByMeta) return undefined;
  const run = await runner.findLatestByMeta('gmv-refresh', 'refreshJobId', jobId);
  return run ? restoreGmvRefreshJob(jobId, run) : undefined;
}

/**
 * 单飞去重：若同一日期区间已有任务在跑（非 done/error 终态），直接复用它，
 * 避免用户连续点“刷新/回填”时重复发起多个 JeeSite 拉单+重算重任务，互相
 * 争抢 SQLite 写锁、放大数据库负载并触发限流。仅对完全相同区间去重——重叠
 * 但不同的区间仍各自运行，以免错误合并语义不同的回填范围。
 */
function findActiveJobForRange(startDate: string, endDate: string): GmvRefreshJob | undefined {
  for (const j of jobs.values()) {
    if (
      j.startDate === startDate &&
      j.endDate === endDate &&
      j.status !== 'done' &&
      j.status !== 'error'
    ) {
      return j;
    }
  }
  return undefined;
}

export function startGmvRefreshJob(
  deps: GmvRefreshJobDeps,
  startDate: string,
  endDate: string
): GmvRefreshJob {
  const active = findActiveJobForRange(startDate, endDate);
  if (active) {
    logger.log(
      `GmvRefresh 去重：[${startDate}→${endDate}] 已有在跑任务 ${active.jobId}（${active.status}），复用而非新建`
    );
    return active;
  }
  const jobId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const job: GmvRefreshJob = {
    jobId,
    status: 'queued',
    startDate,
    endDate,
    progress: { pagesFetched: 0, fetched: 0, upserted: 0, skipped: 0, errors: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  jobs.set(jobId, job);
  if (jobs.size > MAX_JOBS) {
    // Drop the oldest finished jobs to bound memory.
    const finished = [...jobs.values()]
      .filter((j) => j.status === 'done' || j.status === 'error')
      .sort((a, b) => a.updatedAt - b.updatedAt);
    for (const old of finished) {
      if (jobs.size <= MAX_JOBS) break;
      jobs.delete(old.jobId);
    }
  }

  // Fire-and-forget: the HTTP request has already returned the jobId.
  void runJob(job, deps).catch((err) => {
    logger.error(`GmvRefresh job ${jobId} crashed: ${(err as Error).message}`);
  });

  return job;
}

async function runJob(job: GmvRefreshJob, deps: GmvRefreshJobDeps): Promise<void> {
  const execute = async (setMeta: GmvRefreshJobMetaSetter): Promise<number> => {
    try {
      setMeta({
        refreshJobId: job.jobId,
        startDate: job.startDate,
        endDate: job.endDate,
        phase: 'pulling'
      });
      job.status = 'pulling';
      job.updatedAt = Date.now();
      const result = await refreshGmvFromJeesite({
        prisma: deps.prisma,
        autoLogin: deps.autoLogin,
        getMerchantSalesService: deps.getMerchantSalesService,
        invalidateCache: deps.invalidateCache,
        startDate: job.startDate,
        endDate: job.endDate,
        onProgress: (p) => {
          job.progress = { ...job.progress, ...p };
          job.updatedAt = Date.now();
          if (job.status === 'queued') job.status = 'pulling';
          setMeta({ phase: 'pulling', ...p });
        },
        onPhase: (phase) => {
          if (phase === 'recompute') {
            job.status = 'recomputing';
            job.updatedAt = Date.now();
            setMeta({ phase: 'recomputing' });
          }
        }
      });
      job.status = 'finalizing';
      job.updatedAt = Date.now();
      setMeta({ phase: 'finalizing' });
      const kpi = await deps.getKpis(job.endDate);
      job.result = { ...result, kpi };
      job.status = 'done';
      job.updatedAt = Date.now();
      setMeta({
        fetched: result.fetched,
        upserted: result.upserted,
        skipped: result.skipped,
        errors: result.errors,
        pagesFetched: result.pagesFetched,
        phase: 'finalizing',
        pullWarnings: result.pullWarnings,
        pullWarningsCount: result.pullWarnings.length,
        recomputeWarnings: result.recomputeWarnings,
        recomputeWarningsCount: result.recomputeWarnings.length
      });
      logger.log(
        `GmvRefresh job ${job.jobId} done [${job.startDate}→${job.endDate}] pages=${result.pagesFetched} upserted=${result.upserted} errors=${result.errors}`
      );
      return result.upserted;
    } catch (err: unknown) {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
      job.updatedAt = Date.now();
      logger.warn(`GmvRefresh job ${job.jobId} failed: ${job.error}`);
      throw err;
    }
  };

  try {
    if (deps.jobRunner) {
      await deps.jobRunner.runJob(
        'gmv-refresh',
        execute,
        {
          refreshJobId: job.jobId,
          startDate: job.startDate,
          endDate: job.endDate
        },
        { persistMeta: true }
      );
    } else {
      // Keep direct callers/test fixtures compatible; production injects JobRunnerService.
      await execute(() => undefined);
    }
  } catch (err: unknown) {
    if (job.status !== 'error') {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
      job.updatedAt = Date.now();
      logger.warn(`GmvRefresh job ${job.jobId} failed before execution: ${job.error}`);
    }
  }
}
