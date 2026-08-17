import { Logger } from '@nestjs/common';
import { sleep } from '@content/shared';
import type { JobRunRecord, JobRunnerService } from '../jobs/job-runner.service';
import type {
  JeeSitePartnerAccountClient,
  JeeSitePartnerAccountPage
} from './jeesite-partner-account.client';
import {
  aggregatePartnerPickupPointRows,
  type PartnerPickupPointAggregate
} from './partner-pickup-point.mapper';

export const PARTNER_PICKUP_POINT_REFRESH_JOB_NAME = 'partner-pickup-point-refresh';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_INTERVAL_MS = 500;
const MAX_PAGE_INTERVAL_MS = 60_000;
const MAX_REFRESH_PAGES = 5_000;
const MAX_JOBS = 32;

const logger = new Logger('PartnerPickupPointRefreshJob');

export type PartnerPickupPointRefreshJobStatus =
  'queued' | 'pulling' | 'done' | 'error' | 'interrupted';

export interface PartnerPickupPointRefreshProgress {
  currentPage: number;
  pagesFetched: number;
  totalPages: number;
  totalRecords: number;
  recordsFetched: number;
  merchantsPersisted: number;
  skipped: number;
  errors: number;
  pageSize: number;
}

export interface PartnerPickupPointRefreshResult extends PartnerPickupPointRefreshProgress {
  warnings: string[];
}

export interface PartnerPickupPointRefreshJob {
  jobId: string;
  generation: string;
  status: PartnerPickupPointRefreshJobStatus;
  progress: PartnerPickupPointRefreshProgress;
  result?: PartnerPickupPointRefreshResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PartnerPickupPointRefreshConfig {
  pageSize: number;
  pageIntervalMs: number;
}

export interface PartnerPickupPointRefreshPersistResult {
  merchantsPersisted: number;
  errors: number;
}

export interface PartnerPickupPointRefreshJobDeps {
  client: JeeSitePartnerAccountClient;
  prepareSnapshot?: (generation: string) => Promise<void>;
  persistSnapshot: (
    items: PartnerPickupPointAggregate[],
    generation: string
  ) => Promise<PartnerPickupPointRefreshPersistResult>;
  finalizeSnapshot?: (generation: string) => Promise<void>;
  discardSnapshot?: (generation: string) => Promise<void>;
  jobRunner?: JobRunnerService;
}

export type PartnerPickupPointRefreshMetaSetter = (meta: Record<string, unknown>) => void;

const readBoundedInt = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number => {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
};

export function getPartnerPickupPointRefreshConfig(): PartnerPickupPointRefreshConfig {
  return {
    pageSize: readBoundedInt(
      'PARTNER_ACCOUNT_REFRESH_PAGE_SIZE',
      DEFAULT_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE
    ),
    pageIntervalMs: readBoundedInt(
      'PARTNER_ACCOUNT_REFRESH_INTERVAL_MS',
      DEFAULT_PAGE_INTERVAL_MS,
      0,
      MAX_PAGE_INTERVAL_MS
    )
  };
}

const jobs = new Map<string, PartnerPickupPointRefreshJob>();

function createJobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createGeneration(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyProgress(config: PartnerPickupPointRefreshConfig): PartnerPickupPointRefreshProgress {
  return {
    currentPage: 0,
    pagesFetched: 0,
    totalPages: 0,
    totalRecords: 0,
    recordsFetched: 0,
    merchantsPersisted: 0,
    skipped: 0,
    errors: 0,
    pageSize: config.pageSize
  };
}

function findActiveJob(): PartnerPickupPointRefreshJob | undefined {
  return [...jobs.values()].find((job) => job.status === 'queued' || job.status === 'pulling');
}

function trimJobs(): void {
  if (jobs.size <= MAX_JOBS) return;
  const finished = [...jobs.values()]
    .filter(
      (job) => job.status === 'done' || job.status === 'error' || job.status === 'interrupted'
    )
    .sort((left, right) => left.updatedAt - right.updatedAt);
  for (const job of finished) {
    if (jobs.size <= MAX_JOBS) break;
    jobs.delete(job.jobId);
  }
}

function parseMeta(metaJson: string | null): Record<string, unknown> {
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

function readNumber(meta: Record<string, unknown>, key: string): number {
  const value = Number(meta[key]);
  return Number.isFinite(value) ? value : 0;
}

function readString(meta: Record<string, unknown>, key: string): string | undefined {
  const value = meta[key];
  return typeof value === 'string' && value ? value : undefined;
}

function readProgress(meta: Record<string, unknown>): PartnerPickupPointRefreshProgress {
  return {
    currentPage: readNumber(meta, 'currentPage'),
    pagesFetched: readNumber(meta, 'pagesFetched'),
    totalPages: readNumber(meta, 'totalPages'),
    totalRecords: readNumber(meta, 'totalRecords'),
    recordsFetched: readNumber(meta, 'recordsFetched'),
    merchantsPersisted: readNumber(meta, 'merchantsPersisted'),
    skipped: readNumber(meta, 'skipped'),
    errors: readNumber(meta, 'errors'),
    pageSize: readNumber(meta, 'pageSize') || getPartnerPickupPointRefreshConfig().pageSize
  };
}

function readWarnings(meta: Record<string, unknown>): string[] {
  return Array.isArray(meta.warnings)
    ? meta.warnings.filter((value): value is string => typeof value === 'string')
    : [];
}

function mapRunStatus(run: JobRunRecord): PartnerPickupPointRefreshJobStatus {
  if (run.status === 'success') return 'done';
  if (run.status === 'failed') return 'error';
  if (run.status === 'interrupted') return 'interrupted';
  return 'pulling';
}

function parseTimestamp(value: string | null): number {
  const timestamp = Date.parse(value?.replace(' ', 'T') ?? '');
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

export function restorePartnerPickupPointRefreshJob(
  jobId: string,
  run: JobRunRecord
): PartnerPickupPointRefreshJob | undefined {
  const meta = parseMeta(run.metaJson);
  const generation = readString(meta, 'generation');
  if (!generation) return undefined;
  const status = mapRunStatus(run);
  const progress = readProgress(meta);
  return {
    jobId,
    generation,
    status,
    progress,
    result:
      status === 'done'
        ? {
            ...progress,
            warnings: readWarnings(meta)
          }
        : undefined,
    error:
      status === 'error' || status === 'interrupted'
        ? (run.errorMessage ?? (status === 'interrupted' ? '服务重启，刷新任务被中断' : '刷新失败'))
        : undefined,
    createdAt: parseTimestamp(run.startedAt),
    updatedAt: parseTimestamp(run.finishedAt ?? run.startedAt)
  };
}

export function getPartnerPickupPointRefreshJob(
  jobId: string
): PartnerPickupPointRefreshJob | undefined {
  return jobs.get(jobId);
}

export function getActivePartnerPickupPointRefreshJob(): PartnerPickupPointRefreshJob | undefined {
  return findActiveJob();
}

export async function getPersistedPartnerPickupPointRefreshJob(
  jobId: string,
  jobRunner?: JobRunnerService
): Promise<PartnerPickupPointRefreshJob | undefined> {
  if (!jobRunner) return undefined;
  const run = await jobRunner.findLatestByMeta(
    PARTNER_PICKUP_POINT_REFRESH_JOB_NAME,
    'refreshJobId',
    jobId
  );
  return run ? restorePartnerPickupPointRefreshJob(jobId, run) : undefined;
}

export async function getActivePersistedPartnerPickupPointRefreshJob(
  jobRunner?: JobRunnerService
): Promise<PartnerPickupPointRefreshJob | undefined> {
  if (!jobRunner) return undefined;
  const result = await jobRunner.listRuns({
    jobName: PARTNER_PICKUP_POINT_REFRESH_JOB_NAME,
    status: 'running',
    page: 1,
    pageSize: 1
  });
  const run = result.items[0];
  if (!run) return undefined;
  const jobId = readString(parseMeta(run.metaJson), 'refreshJobId');
  return jobId ? restorePartnerPickupPointRefreshJob(jobId, run) : undefined;
}

export async function getActivePersistedOrInMemoryPartnerPickupPointRefreshJob(
  jobRunner?: JobRunnerService
): Promise<PartnerPickupPointRefreshJob | undefined> {
  return (
    getActivePartnerPickupPointRefreshJob() ??
    getActivePersistedPartnerPickupPointRefreshJob(jobRunner)
  );
}

export function startPartnerPickupPointRefreshJob(
  deps: PartnerPickupPointRefreshJobDeps
): PartnerPickupPointRefreshJob {
  const active = findActiveJob();
  if (active) return active;

  const config = getPartnerPickupPointRefreshConfig();
  const job: PartnerPickupPointRefreshJob = {
    jobId: createJobId(),
    generation: createGeneration(),
    status: 'queued',
    progress: emptyProgress(config),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  jobs.set(job.jobId, job);
  trimJobs();

  void runPartnerPickupPointRefreshJob(job, deps).catch((error: unknown) => {
    job.status = 'error';
    job.error = error instanceof Error ? error.message : String(error);
    job.updatedAt = Date.now();
    logger.error(`商家提货分刷新任务 ${job.jobId} 异常退出: ${String(error)}`);
  });
  return job;
}

function mergeAggregate(
  target: PartnerPickupPointAggregate | undefined,
  incoming: PartnerPickupPointAggregate
): PartnerPickupPointAggregate {
  return {
    merchantId: incoming.merchantId,
    merchantName: incoming.merchantName,
    availablePointCenti: (target?.availablePointCenti ?? 0n) + incoming.availablePointCenti,
    recordCount: (target?.recordCount ?? 0) + incoming.recordCount,
    activeRecordCount: (target?.activeRecordCount ?? 0) + incoming.activeRecordCount,
    invalidPointRows: (target?.invalidPointRows ?? 0) + incoming.invalidPointRows
  };
}

async function runPartnerPickupPointRefreshJob(
  job: PartnerPickupPointRefreshJob,
  deps: PartnerPickupPointRefreshJobDeps
): Promise<void> {
  const config = getPartnerPickupPointRefreshConfig();
  const execute = async (setMeta: PartnerPickupPointRefreshMetaSetter): Promise<number> => {
    const warnings: string[] = [];
    const byMerchant = new Map<string, PartnerPickupPointAggregate>();
    let pageNo = 1;
    let totalPages = 1;
    let totalRecords = 0;
    let pageSize = config.pageSize;

    const checkpoint = (extra: Record<string, unknown> = {}) => {
      job.updatedAt = Date.now();
      setMeta({
        refreshJobId: job.jobId,
        generation: job.generation,
        phase: job.status,
        ...job.progress,
        warnings,
        ...extra
      });
    };

    try {
      job.status = 'pulling';
      checkpoint();
      if (deps.prepareSnapshot) await deps.prepareSnapshot(job.generation);

      while (pageNo <= totalPages) {
        if (pageNo > 1 && config.pageIntervalMs > 0) {
          await sleep(config.pageIntervalMs);
        }

        const page: JeeSitePartnerAccountPage = await deps.client.listPartnerAccountRecords({
          page: pageNo,
          pageSize: config.pageSize
        });
        if (page.list.length > config.pageSize) {
          throw new Error(
            `JeeSite 合作商账户记录接口第 ${pageNo} 页返回 ${page.list.length} 条，超过安全页大小 ${config.pageSize}`
          );
        }

        pageSize = Math.min(config.pageSize, Math.max(1, page.pageSize || pageSize));
        totalRecords = Math.max(
          totalRecords,
          page.count,
          job.progress.recordsFetched + page.list.length
        );
        totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
        if (totalPages > MAX_REFRESH_PAGES) {
          throw new Error(`商家提货分刷新页数超过安全上限 ${MAX_REFRESH_PAGES}`);
        }
        if (!page.list.length) {
          if (pageNo === 1 && page.count === 0) {
            throw new Error('JeeSite 合作商账户记录接口返回 0 条，未切换旧提货分快照');
          }
          throw new Error(`JeeSite 合作商账户记录接口第 ${pageNo} 页为空，刷新未完成`);
        }

        const pageAggregate = aggregatePartnerPickupPointRows(page.list);
        for (const item of pageAggregate.items) {
          byMerchant.set(item.merchantId, mergeAggregate(byMerchant.get(item.merchantId), item));
        }
        job.progress = {
          currentPage: pageNo,
          pagesFetched: job.progress.pagesFetched + 1,
          totalPages,
          totalRecords,
          recordsFetched: job.progress.recordsFetched + page.list.length,
          merchantsPersisted: job.progress.merchantsPersisted,
          skipped: job.progress.skipped + pageAggregate.skipped,
          errors: job.progress.errors + pageAggregate.errors,
          pageSize
        };
        checkpoint();

        if (pageNo >= totalPages) break;
        const expectedRemaining = Math.max(0, totalRecords - pageNo * pageSize);
        if (page.list.length < pageSize && expectedRemaining > 0) {
          throw new Error(`外部返回总数 ${totalRecords} 与第 ${pageNo} 页长度不一致，刷新未完成`);
        }
        pageNo += 1;
      }

      const items = [...byMerchant.values()];
      if (!items.length) throw new Error('外部合作商账户记录快照没有可识别的商家 ID，未覆盖旧数据');
      if (job.progress.errors > 0) {
        throw new Error(
          `外部合作商账户记录有 ${job.progress.errors} 条提货分不是最多两位小数，未切换旧快照`
        );
      }

      const persisted = await deps.persistSnapshot(items, job.generation);
      job.progress = {
        ...job.progress,
        merchantsPersisted: persisted.merchantsPersisted,
        errors: job.progress.errors + persisted.errors
      };
      checkpoint({ snapshotReady: persisted.errors === 0 });
      if (persisted.errors > 0) {
        throw new Error(`商家提货分快照有 ${persisted.errors} 条记录写入失败，未切换快照`);
      }

      if (deps.finalizeSnapshot) await deps.finalizeSnapshot(job.generation);
      job.status = 'done';
      job.result = { ...job.progress, warnings };
      checkpoint({ snapshotReady: true });
      logger.log(
        `商家提货分刷新完成 job=${job.jobId} pages=${job.progress.pagesFetched} records=${job.progress.recordsFetched} merchants=${job.progress.merchantsPersisted}`
      );
      return job.progress.merchantsPersisted;
    } catch (error: unknown) {
      try {
        if (deps.discardSnapshot) await deps.discardSnapshot(job.generation);
      } catch (cleanupError: unknown) {
        logger.warn(`商家提货分刷新任务 ${job.jobId} 清理 staging 失败: ${String(cleanupError)}`);
      }
      job.status = 'error';
      job.error = error instanceof Error ? error.message : String(error);
      job.updatedAt = Date.now();
      checkpoint({ error: job.error, snapshotReady: false });
      logger.warn(`商家提货分刷新失败 job=${job.jobId}: ${job.error}`);
      throw error;
    }
  };

  if (deps.jobRunner) {
    await deps.jobRunner.runJob(
      PARTNER_PICKUP_POINT_REFRESH_JOB_NAME,
      execute,
      {
        refreshJobId: job.jobId,
        generation: job.generation,
        pageSize: config.pageSize
      },
      { persistMeta: true }
    );
    return;
  }
  await execute(() => undefined);
}
