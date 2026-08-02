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
import { MerchantSalesService } from '../merchant-sales/merchant-sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { GmvRefreshResult, refreshGmvFromJeesite, type JeesitePullProgress } from './gmv-refresh';

export type GmvRefreshJobStatus =
  'queued' | 'pulling' | 'recomputing' | 'finalizing' | 'done' | 'error';

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

export interface GmvRefreshJobDeps {
  prisma: PrismaService;
  autoLogin?: AutoLoginService;
  getMerchantSalesService: () => Promise<MerchantSalesService | null>;
  invalidateCache: () => void;
  getKpis: (date: string) => Promise<unknown>;
}

const logger = new Logger('GmvRefreshJob');
const jobs = new Map<string, GmvRefreshJob>();
const MAX_JOBS = 64;

export function getGmvRefreshJob(jobId: string): GmvRefreshJob | undefined {
  return jobs.get(jobId);
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
  try {
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
      },
      onPhase: (phase) => {
        if (phase === 'recompute') {
          job.status = 'recomputing';
          job.updatedAt = Date.now();
        }
      }
    });
    job.status = 'finalizing';
    job.updatedAt = Date.now();
    const kpi = await deps.getKpis(job.endDate);
    job.result = { ...result, kpi };
    job.status = 'done';
    job.updatedAt = Date.now();
    logger.log(
      `GmvRefresh job ${job.jobId} done [${job.startDate}→${job.endDate}] pages=${result.pagesFetched} upserted=${result.upserted} errors=${result.errors}`
    );
  } catch (err) {
    job.status = 'error';
    job.error = (err as Error).message;
    job.updatedAt = Date.now();
    logger.warn(`GmvRefresh job ${job.jobId} failed: ${job.error}`);
  }
}
