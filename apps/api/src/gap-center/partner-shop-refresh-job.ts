import { Logger } from '@nestjs/common';
import { sleep } from '@content/shared';
import type { JobRunRecord, JobRunnerService } from '../jobs/job-runner.service';
import type {
  JeeSitePartnerShopClient,
  JeeSitePartnerShopPage
} from './jeesite-partner-shop.client';
import type { AnyRecord } from '../content/jeesite-row-reader';

export const PARTNER_SHOP_REFRESH_JOB_NAME = 'partner-shop-refresh';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_INTERVAL_MS = 500;
const MAX_PAGE_INTERVAL_MS = 60_000;
const MAX_REFRESH_PAGES = 1_000;
const MAX_JOBS = 32;

const logger = new Logger('PartnerShopRefreshJob');

export type PartnerShopRefreshJobStatus = 'queued' | 'pulling' | 'done' | 'error' | 'interrupted';

export interface PartnerShopRefreshProgress {
  currentPage: number;
  pagesFetched: number;
  totalPages: number;
  totalShops: number;
  shopsFetched: number;
  storesPersisted: number;
  merchantsUpdated: number;
  skipped: number;
  errors: number;
  pageSize: number;
}

export interface PartnerShopRefreshResult extends PartnerShopRefreshProgress {
  warnings: string[];
}

export interface PartnerShopRefreshJob {
  jobId: string;
  status: PartnerShopRefreshJobStatus;
  progress: PartnerShopRefreshProgress;
  result?: PartnerShopRefreshResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PartnerShopRefreshConfig {
  pageSize: number;
  pageIntervalMs: number;
}

export interface PartnerShopRefreshPersistResult {
  storesPersisted: number;
  merchantsUpdated: number;
  skipped: number;
  errors: number;
}

export interface PartnerShopRefreshJobDeps {
  client: JeeSitePartnerShopClient;
  persistSnapshot: (rows: AnyRecord[]) => Promise<PartnerShopRefreshPersistResult>;
  jobRunner?: JobRunnerService;
}

export type PartnerShopRefreshMetaSetter = (meta: Record<string, unknown>) => void;

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

export function getPartnerShopRefreshConfig(): PartnerShopRefreshConfig {
  return {
    pageSize: readBoundedInt('PARTNER_SHOP_REFRESH_PAGE_SIZE', DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    pageIntervalMs: readBoundedInt(
      'PARTNER_SHOP_REFRESH_INTERVAL_MS',
      DEFAULT_PAGE_INTERVAL_MS,
      0,
      MAX_PAGE_INTERVAL_MS
    )
  };
}

const jobs = new Map<string, PartnerShopRefreshJob>();

function createJobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyProgress(config: PartnerShopRefreshConfig): PartnerShopRefreshProgress {
  return {
    currentPage: 0,
    pagesFetched: 0,
    totalPages: 0,
    totalShops: 0,
    shopsFetched: 0,
    storesPersisted: 0,
    merchantsUpdated: 0,
    skipped: 0,
    errors: 0,
    pageSize: config.pageSize
  };
}

function findActiveJob(): PartnerShopRefreshJob | undefined {
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

function readProgress(meta: Record<string, unknown>): PartnerShopRefreshProgress {
  return {
    currentPage: readNumber(meta, 'currentPage'),
    pagesFetched: readNumber(meta, 'pagesFetched'),
    totalPages: readNumber(meta, 'totalPages'),
    totalShops: readNumber(meta, 'totalShops'),
    shopsFetched: readNumber(meta, 'shopsFetched'),
    storesPersisted: readNumber(meta, 'storesPersisted'),
    merchantsUpdated: readNumber(meta, 'merchantsUpdated'),
    skipped: readNumber(meta, 'skipped'),
    errors: readNumber(meta, 'errors'),
    pageSize: readNumber(meta, 'pageSize') || getPartnerShopRefreshConfig().pageSize
  };
}

function readWarnings(meta: Record<string, unknown>): string[] {
  return Array.isArray(meta.warnings)
    ? meta.warnings.filter((value): value is string => typeof value === 'string')
    : [];
}

function mapRunStatus(run: JobRunRecord): PartnerShopRefreshJobStatus {
  if (run.status === 'success') return 'done';
  if (run.status === 'failed') return 'error';
  if (run.status === 'interrupted') return 'interrupted';
  return 'pulling';
}

function parseTimestamp(value: string | null): number {
  const timestamp = Date.parse(value?.replace(' ', 'T') ?? '');
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

export function restorePartnerShopRefreshJob(
  jobId: string,
  run: JobRunRecord
): PartnerShopRefreshJob {
  const meta = parseMeta(run.metaJson);
  const status = mapRunStatus(run);
  const progress = readProgress(meta);
  return {
    jobId,
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

export function getPartnerShopRefreshJob(jobId: string): PartnerShopRefreshJob | undefined {
  return jobs.get(jobId);
}

export function getActivePartnerShopRefreshJob(): PartnerShopRefreshJob | undefined {
  return findActiveJob();
}

export async function getPersistedPartnerShopRefreshJob(
  jobId: string,
  jobRunner?: JobRunnerService
): Promise<PartnerShopRefreshJob | undefined> {
  if (!jobRunner) return undefined;
  const run = await jobRunner.findLatestByMeta(
    PARTNER_SHOP_REFRESH_JOB_NAME,
    'refreshJobId',
    jobId
  );
  return run ? restorePartnerShopRefreshJob(jobId, run) : undefined;
}

export async function getActivePersistedPartnerShopRefreshJob(
  jobRunner?: JobRunnerService
): Promise<PartnerShopRefreshJob | undefined> {
  if (!jobRunner) return undefined;
  const result = await jobRunner.listRuns({
    jobName: PARTNER_SHOP_REFRESH_JOB_NAME,
    status: 'running',
    page: 1,
    pageSize: 1
  });
  const run = result.items[0];
  if (!run) return undefined;
  const meta = parseMeta(run.metaJson);
  const jobId = typeof meta.refreshJobId === 'string' ? meta.refreshJobId : undefined;
  return jobId ? restorePartnerShopRefreshJob(jobId, run) : undefined;
}

export async function getActivePersistedOrInMemoryPartnerShopRefreshJob(
  jobRunner?: JobRunnerService
): Promise<PartnerShopRefreshJob | undefined> {
  return getActivePartnerShopRefreshJob() ?? getActivePersistedPartnerShopRefreshJob(jobRunner);
}

export function startPartnerShopRefreshJob(deps: PartnerShopRefreshJobDeps): PartnerShopRefreshJob {
  const active = findActiveJob();
  if (active) return active;

  const config = getPartnerShopRefreshConfig();
  const job: PartnerShopRefreshJob = {
    jobId: createJobId(),
    status: 'queued',
    progress: emptyProgress(config),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  jobs.set(job.jobId, job);
  trimJobs();

  void runPartnerShopRefreshJob(job, deps).catch((error: unknown) => {
    job.status = 'error';
    job.error = error instanceof Error ? error.message : String(error);
    job.updatedAt = Date.now();
    logger.error(`合作商店铺刷新任务 ${job.jobId} 异常退出: ${String(error)}`);
  });
  return job;
}

async function runPartnerShopRefreshJob(
  job: PartnerShopRefreshJob,
  deps: PartnerShopRefreshJobDeps
): Promise<void> {
  const config = getPartnerShopRefreshConfig();
  const execute = async (setMeta: PartnerShopRefreshMetaSetter): Promise<number> => {
    const warnings: string[] = [];
    const rows: AnyRecord[] = [];
    let pageNo = 1;
    let totalPages = 1;
    let totalShops = 0;
    let pageSize = config.pageSize;

    const checkpoint = (extra: Record<string, unknown> = {}) => {
      job.updatedAt = Date.now();
      setMeta({ refreshJobId: job.jobId, phase: job.status, ...job.progress, warnings, ...extra });
    };

    try {
      job.status = 'pulling';
      checkpoint();

      while (pageNo <= totalPages) {
        if (pageNo > 1 && config.pageIntervalMs > 0) {
          await sleep(config.pageIntervalMs);
        }

        const page: JeeSitePartnerShopPage = await deps.client.listPartnerShops({
          page: pageNo,
          pageSize: config.pageSize
        });
        if (page.list.length > config.pageSize) {
          throw new Error(
            `JeeSite 合作商店铺接口第 ${pageNo} 页返回 ${page.list.length} 条，超过安全页大小 ${config.pageSize}`
          );
        }

        pageSize = Math.min(config.pageSize, Math.max(1, page.pageSize || pageSize));
        totalShops = Math.max(totalShops, page.count, rows.length + page.list.length);
        totalPages = Math.max(1, Math.ceil(totalShops / pageSize));
        if (totalPages > MAX_REFRESH_PAGES) {
          throw new Error(`合作商店铺刷新页数超过安全上限 ${MAX_REFRESH_PAGES}`);
        }
        if (!page.list.length) {
          if (pageNo === 1 && page.count === 0) {
            throw new Error('JeeSite 合作商店铺接口返回 0 条，未覆盖旧门店数据');
          }
          throw new Error(`JeeSite 合作商店铺接口第 ${pageNo} 页为空，刷新未完成`);
        }

        rows.push(...page.list);
        job.progress = {
          ...job.progress,
          currentPage: pageNo,
          pagesFetched: job.progress.pagesFetched + 1,
          totalPages,
          totalShops,
          shopsFetched: rows.length,
          pageSize
        };
        checkpoint();

        if (pageNo >= totalPages) break;
        const expectedRemaining = Math.max(0, totalShops - pageNo * pageSize);
        if (page.list.length < pageSize && expectedRemaining > 0) {
          throw new Error(`外部返回总数 ${totalShops} 与第 ${pageNo} 页长度不一致，刷新未完成`);
        }
        pageNo += 1;
      }

      if (!rows.length) throw new Error('JeeSite 合作商店铺接口返回空快照，未覆盖旧门店数据');

      // Fetching is complete before this transaction starts. A network failure
      // therefore leaves the previous local snapshot untouched.
      const persisted = await deps.persistSnapshot(rows);
      job.progress = {
        ...job.progress,
        storesPersisted: persisted.storesPersisted,
        merchantsUpdated: persisted.merchantsUpdated,
        skipped: persisted.skipped,
        errors: persisted.errors
      };
      checkpoint({ snapshotReady: persisted.errors === 0 });
      if (persisted.errors > 0) {
        throw new Error(`合作商店铺快照有 ${persisted.errors} 条记录写入失败，未切换快照`);
      }

      job.status = 'done';
      job.result = { ...job.progress, warnings };
      checkpoint({ snapshotReady: true });
      logger.log(
        `合作商店铺刷新完成 job=${job.jobId} pages=${job.progress.pagesFetched} stores=${job.progress.storesPersisted} merchants=${job.progress.merchantsUpdated} skipped=${job.progress.skipped}`
      );
      return job.progress.storesPersisted;
    } catch (error: unknown) {
      job.status = 'error';
      job.error = error instanceof Error ? error.message : String(error);
      job.updatedAt = Date.now();
      checkpoint({ error: job.error, snapshotReady: false });
      logger.warn(`合作商店铺刷新失败 job=${job.jobId}: ${job.error}`);
      throw error;
    }
  };

  try {
    if (deps.jobRunner) {
      await deps.jobRunner.runJob(
        PARTNER_SHOP_REFRESH_JOB_NAME,
        execute,
        { refreshJobId: job.jobId, pageSize: config.pageSize },
        { persistMeta: true }
      );
    } else {
      await execute(() => undefined);
    }
  } catch (error: unknown) {
    if (job.status !== 'error') {
      job.status = 'error';
      job.error = error instanceof Error ? error.message : String(error);
      job.updatedAt = Date.now();
    }
  }
}
