/**
 * Background refresh for the external member directory.
 *
 * The HTTP request only creates a job. The job fetches one page at a time,
 * waits between pages, and persists each page into a generation-scoped staging
 * table. A failed run therefore leaves the last known directory readable.
 */
import { Logger } from '@nestjs/common';
import { sleep } from '@content/shared';
import type { JobRunRecord, JobRunnerService } from '../jobs/job-runner.service';
import type {
  JeeSiteMemberClient,
  JeeSiteMemberPage,
  JeeSiteMemberRow
} from './jeesite-member.client';

export const USER_CENTER_REFRESH_JOB_NAME = 'user-center-member-refresh';
export const USER_CENTER_INCREMENTAL_JOB_NAME = 'user-center-member-incremental';

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_INTERVAL_MS = 1_000;
const MAX_PAGE_INTERVAL_MS = 60_000;
const MAX_REFRESH_PAGES = 10_000;
// 增量同步默认只抓前若干页（每页 500，上限 100 页 = 5 万条），覆盖单次新增潮
const MAX_INCREMENTAL_PAGES = 100;
const MAX_JOBS = 32;

const logger = new Logger('UserCenterRefreshJob');

export type UserCenterRefreshJobStatus = 'queued' | 'pulling' | 'done' | 'error' | 'interrupted';
export type UserCenterRefreshJobKind = 'full' | 'incremental';

export interface UserCenterRefreshProgress {
  currentPage: number;
  pagesFetched: number;
  totalPages: number;
  totalMembers: number;
  membersFetched: number;
  membersPersisted: number;
  errors: number;
  pageSize: number;
}

export interface UserCenterRefreshResult extends UserCenterRefreshProgress {
  warnings: string[];
}

export interface UserCenterRefreshJob {
  kind: UserCenterRefreshJobKind;
  jobId: string;
  generation: string;
  status: UserCenterRefreshJobStatus;
  progress: UserCenterRefreshProgress;
  result?: UserCenterRefreshResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserCenterRefreshConfig {
  pageSize: number;
  pageIntervalMs: number;
}

export interface UserCenterRefreshJobDeps {
  client: JeeSiteMemberClient;
  /** Remove abandoned staging rows before a new generation starts. */
  prepareSnapshot?: (generation: string) => Promise<void>;
  persistPage: (
    rows: JeeSiteMemberRow[],
    generation: string
  ) => Promise<{ persisted: number; errors: number }>;
  /** Publish the generation only after every page has been validated. */
  finalizeSnapshot?: (generation: string) => Promise<void>;
  /** Best-effort cleanup when a generation cannot become active. */
  discardSnapshot?: (generation: string) => Promise<void>;
  jobRunner?: JobRunnerService;
}

export interface UserCenterIncrementalBoundary {
  memberId: string;
  sourceCreatedAt: Date;
}

/** 增量同步依赖：复用活动 generation，读取到最新旧记录后早停。 */
export interface UserCenterIncrementalJobDeps {
  client: JeeSiteMemberClient;
  /** 返回当前活动会员目录 generation；无则增量无法进行，应改走全量。 */
  resolveActiveGeneration: () => Promise<string | null>;
  /** 返回活动 generation 下按 sourceCreatedAt 排序的最新旧记录，作为早停边界。 */
  loadLatestExistingMember: (generation: string) => Promise<UserCenterIncrementalBoundary | null>;
  /** 仅 upsert 边界之前的新行，返回本页实际写入结果。 */
  persistIncrementalPage: (
    rows: JeeSiteMemberRow[],
    generation: string
  ) => Promise<{ persisted: number; errors: number }>;
  jobRunner?: JobRunnerService;
}

export type UserCenterRefreshMetaSetter = (meta: Record<string, unknown>) => void;

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

export function getUserCenterRefreshConfig(): UserCenterRefreshConfig {
  return {
    pageSize: readBoundedInt('USER_CENTER_REFRESH_PAGE_SIZE', DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    pageIntervalMs: readBoundedInt(
      'USER_CENTER_REFRESH_INTERVAL_MS',
      DEFAULT_PAGE_INTERVAL_MS,
      0,
      MAX_PAGE_INTERVAL_MS
    )
  };
}

const jobs = new Map<string, UserCenterRefreshJob>();

function createJobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createGeneration(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyProgress(config: UserCenterRefreshConfig): UserCenterRefreshProgress {
  return {
    currentPage: 0,
    pagesFetched: 0,
    totalPages: 0,
    totalMembers: 0,
    membersFetched: 0,
    membersPersisted: 0,
    errors: 0,
    pageSize: config.pageSize
  };
}

function findActiveJob(): UserCenterRefreshJob | undefined {
  return [...jobs.values()].find((job) => job.status === 'queued' || job.status === 'pulling');
}

function readExternalMemberId(row: JeeSiteMemberRow): string | null {
  const value = row.id ?? row.memberId;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
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

function readProgress(meta: Record<string, unknown>): UserCenterRefreshProgress {
  return {
    currentPage: readNumber(meta, 'currentPage'),
    pagesFetched: readNumber(meta, 'pagesFetched'),
    totalPages: readNumber(meta, 'totalPages'),
    totalMembers: readNumber(meta, 'totalMembers'),
    membersFetched: readNumber(meta, 'membersFetched'),
    membersPersisted: readNumber(meta, 'membersPersisted'),
    errors: readNumber(meta, 'errors'),
    pageSize: readNumber(meta, 'pageSize') || getUserCenterRefreshConfig().pageSize
  };
}

function mapRunStatus(run: JobRunRecord): UserCenterRefreshJobStatus {
  if (run.status === 'success') return 'done';
  if (run.status === 'failed') return 'error';
  if (run.status === 'interrupted') return 'interrupted';
  return 'pulling';
}

export function restoreUserCenterRefreshJob(
  jobId: string,
  run: JobRunRecord
): UserCenterRefreshJob | undefined {
  const meta = parseMeta(run.metaJson);
  const generation = readString(meta, 'generation');
  if (!generation) return undefined;
  const status = mapRunStatus(run);
  const progress = readProgress(meta);
  const warnings = Array.isArray(meta.warnings)
    ? meta.warnings.filter((value): value is string => typeof value === 'string')
    : [];
  return {
    kind: meta.kind === 'incremental' ? 'incremental' : 'full',
    jobId,
    generation,
    status,
    progress,
    result:
      status === 'done'
        ? {
            ...progress,
            warnings
          }
        : undefined,
    error:
      status === 'error' || status === 'interrupted'
        ? (run.errorMessage ?? (status === 'interrupted' ? '服务重启，刷新任务被中断' : '刷新失败'))
        : undefined,
    createdAt: Date.parse(run.startedAt.replace(' ', 'T')) || Date.now(),
    updatedAt: Date.parse((run.finishedAt ?? run.startedAt).replace(' ', 'T')) || Date.now()
  };
}

export function getUserCenterRefreshJob(jobId: string): UserCenterRefreshJob | undefined {
  return jobs.get(jobId);
}

export function getActiveUserCenterRefreshJob(): UserCenterRefreshJob | undefined {
  return findActiveJob();
}

export async function getPersistedUserCenterRefreshJob(
  jobId: string,
  jobRunner?: JobRunnerService
): Promise<UserCenterRefreshJob | undefined> {
  if (!jobRunner) return undefined;
  const fullRun = await jobRunner.findLatestByMeta(
    USER_CENTER_REFRESH_JOB_NAME,
    'refreshJobId',
    jobId
  );
  if (fullRun) return restoreUserCenterRefreshJob(jobId, fullRun);
  const incrementalRun = await jobRunner.findLatestByMeta(
    USER_CENTER_INCREMENTAL_JOB_NAME,
    'refreshJobId',
    jobId
  );
  return incrementalRun ? restoreUserCenterRefreshJob(jobId, incrementalRun) : undefined;
}

export async function getActivePersistedUserCenterRefreshJob(
  jobRunner?: JobRunnerService
): Promise<UserCenterRefreshJob | undefined> {
  if (!jobRunner) return undefined;
  // 增量与全量互斥，任一在跑都视为活动任务；优先返回最新那条
  const [fullResult, incrementalResult] = await Promise.all([
    jobRunner.listRuns({
      jobName: USER_CENTER_REFRESH_JOB_NAME,
      status: 'running',
      page: 1,
      pageSize: 1
    }),
    jobRunner.listRuns({
      jobName: USER_CENTER_INCREMENTAL_JOB_NAME,
      status: 'running',
      page: 1,
      pageSize: 1
    })
  ]);
  const candidates = [fullResult.items[0], incrementalResult.items[0]].filter(
    (run): run is JobRunRecord => Boolean(run)
  );
  if (!candidates.length) return undefined;
  // JobRun 的 startedAt 为字符串时间戳，直接比较可定序
  candidates.sort((a, b) =>
    (b.startedAt ?? '').localeCompare(a.startedAt ?? '')
  );
  const jobId = readString(parseMeta(candidates[0].metaJson), 'refreshJobId');
  return jobId ? restoreUserCenterRefreshJob(jobId, candidates[0]) : undefined;
}

export async function getActivePersistedOrInMemoryUserCenterRefreshJob(
  jobRunner?: JobRunnerService
): Promise<UserCenterRefreshJob | undefined> {
  return getActiveUserCenterRefreshJob() ?? getActivePersistedUserCenterRefreshJob(jobRunner);
}

export function startUserCenterRefreshJob(deps: UserCenterRefreshJobDeps): UserCenterRefreshJob {
  const active = findActiveJob();
  if (active) return active;

  const config = getUserCenterRefreshConfig();
  const job: UserCenterRefreshJob = {
    kind: 'full',
    jobId: createJobId(),
    generation: createGeneration(),
    status: 'queued',
    progress: emptyProgress(config),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  jobs.set(job.jobId, job);
  trimJobs();

  void runUserCenterRefreshJob(job, deps).catch((error: unknown) => {
    job.status = 'error';
    job.error = error instanceof Error ? error.message : String(error);
    job.updatedAt = Date.now();
    logger.error(`会员目录刷新任务 ${job.jobId} 异常退出: ${String(error)}`);
  });
  return job;
}

/**
 * 启动增量同步任务：复用当前活动 generation，从第 1 页抓起，遇到最新旧记录即早停。
 * 与全量任务共享内存互斥（findActiveJob），二者不能同时运行。
 */
export function startUserCenterIncrementalRefreshJob(
  deps: UserCenterIncrementalJobDeps
): UserCenterRefreshJob {
  const active = findActiveJob();
  if (active) return active;

  const config = getUserCenterRefreshConfig();
  const job: UserCenterRefreshJob = {
    kind: 'incremental',
    jobId: createJobId(),
    generation: '',
    status: 'queued',
    progress: emptyProgress(config),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  jobs.set(job.jobId, job);
  trimJobs();

  void runUserCenterIncrementalRefreshJob(job, deps).catch((error: unknown) => {
    job.status = 'error';
    job.error = error instanceof Error ? error.message : String(error);
    job.updatedAt = Date.now();
    logger.error(`会员目录增量任务 ${job.jobId} 异常退出: ${String(error)}`);
  });
  return job;
}

async function runUserCenterRefreshJob(
  job: UserCenterRefreshJob,
  deps: UserCenterRefreshJobDeps
): Promise<void> {
  const config = getUserCenterRefreshConfig();
  const execute = async (setMeta: UserCenterRefreshMetaSetter): Promise<number> => {
    const warnings: string[] = [];
    let pageNo = 1;
    let totalPages = 1;
    let totalMembers = 0;
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
      if (deps.prepareSnapshot) {
        await deps.prepareSnapshot(job.generation);
      }

      while (pageNo <= totalPages) {
        if (pageNo > 1 && config.pageIntervalMs > 0) {
          await sleep(config.pageIntervalMs);
        }

        const page: JeeSiteMemberPage = await deps.client.listMembers({
          page: pageNo,
          pageSize
        });
        if (page.list.length > config.pageSize) {
          throw new Error(
            `JeeSite 会员接口第 ${pageNo} 页返回 ${page.list.length} 条，超过安全页大小 ${config.pageSize}`
          );
        }
        pageSize = Math.min(config.pageSize, Math.max(1, page.pageSize || pageSize));
        totalMembers = Math.max(totalMembers, page.count);
        totalPages = Math.max(1, Math.ceil(totalMembers / pageSize));
        if (totalPages > MAX_REFRESH_PAGES) {
          throw new Error(`会员刷新页数超过安全上限 ${MAX_REFRESH_PAGES}`);
        }

        if (!page.list.length) {
          if (pageNo === 1 && page.count === 0) {
            throw new Error('JeeSite 会员接口返回 0 条，未切换旧会员快照');
          }
          throw new Error(`JeeSite 会员接口第 ${pageNo} 页为空，刷新未完成`);
        }

        const persisted = await deps.persistPage(page.list, job.generation);
        job.progress = {
          currentPage: pageNo,
          pagesFetched: job.progress.pagesFetched + 1,
          totalPages,
          totalMembers,
          membersFetched: job.progress.membersFetched + page.list.length,
          membersPersisted: job.progress.membersPersisted + persisted.persisted,
          errors: job.progress.errors + persisted.errors,
          pageSize
        };
        checkpoint();

        if (page.list.length < pageSize) {
          const expectedRemaining = Math.max(0, totalMembers - (pageNo - 1) * pageSize);
          if (pageNo < totalPages) {
            throw new Error(`外部返回总数 ${totalMembers} 与第 ${pageNo} 页长度不一致，刷新未完成`);
          }
          if (page.list.length < expectedRemaining) {
            throw new Error(
              `外部返回第 ${pageNo} 页仅 ${page.list.length} 条，预计至少 ${expectedRemaining} 条，刷新未完成`
            );
          }
          break;
        }
        pageNo += 1;
      }

      if (job.progress.errors > 0) {
        throw new Error(`会员目录刷新有 ${job.progress.errors} 条记录未能持久化，未切换旧快照`);
      }

      if (deps.finalizeSnapshot) {
        await deps.finalizeSnapshot(job.generation);
      }
      job.status = 'done';
      job.result = { ...job.progress, warnings };
      checkpoint({ snapshotReady: true });
      logger.log(
        `会员目录刷新完成 job=${job.jobId} pages=${job.progress.pagesFetched} persisted=${job.progress.membersPersisted} errors=${job.progress.errors}`
      );
      return job.progress.membersPersisted;
    } catch (error: unknown) {
      try {
        if (deps.discardSnapshot) {
          await deps.discardSnapshot(job.generation);
        }
      } catch (cleanupError: unknown) {
        logger.warn(`会员目录刷新任务 ${job.jobId} 清理 staging 失败: ${String(cleanupError)}`);
      }
      job.status = 'error';
      job.error = error instanceof Error ? error.message : String(error);
      job.updatedAt = Date.now();
      checkpoint({ error: job.error });
      logger.warn(`会员目录刷新失败 job=${job.jobId}: ${job.error}`);
      throw error;
    }
  };

  if (deps.jobRunner) {
    await deps.jobRunner.runJob(
      USER_CENTER_REFRESH_JOB_NAME,
      execute,
      {
        refreshJobId: job.jobId,
        kind: 'full',
        generation: job.generation,
        pageSize: config.pageSize
      },
      { persistMeta: true }
    );
    return;
  }
  await execute(() => undefined);
}

async function runUserCenterIncrementalRefreshJob(
  job: UserCenterRefreshJob,
  deps: UserCenterIncrementalJobDeps
): Promise<void> {
  const config = getUserCenterRefreshConfig();
  const execute = async (setMeta: UserCenterRefreshMetaSetter): Promise<number> => {
    const warnings: string[] = [];

    const checkpoint = (extra: Record<string, unknown> = {}) => {
      job.updatedAt = Date.now();
      setMeta({
        refreshJobId: job.jobId,
        kind: 'incremental',
        generation: job.generation,
        phase: job.status,
        ...job.progress,
        warnings,
        ...extra
      });
    };

    try {
      const activeGeneration = await deps.resolveActiveGeneration();
      if (!activeGeneration) {
        throw new Error('无活动会员目录快照，请先执行全量同步');
      }
      job.generation = activeGeneration;
      job.status = 'pulling';
      checkpoint();

      const boundary = await deps.loadLatestExistingMember(activeGeneration);
      if (!boundary) {
        throw new Error('活动快照没有可用的最新旧用户边界，请先执行全量同步');
      }
      warnings.push(
        `增量边界 memberId=${boundary.memberId} sourceCreatedAt=${boundary.sourceCreatedAt.toISOString()}`
      );

      let pageNo = 1;
      let totalPages = 1;
      let totalMembers = 0;
      let pageSize = config.pageSize;
      let earlyStopped = false;
      let boundaryFound = false;

      while (pageNo <= totalPages) {
        if (pageNo > 1 && config.pageIntervalMs > 0) {
          await sleep(config.pageIntervalMs);
        }

        const page: JeeSiteMemberPage = await deps.client.listMembers({
          page: pageNo,
          pageSize
        });
        if (page.list.length > config.pageSize) {
          throw new Error(
            `JeeSite 会员接口第 ${pageNo} 页返回 ${page.list.length} 条，超过安全页大小 ${config.pageSize}`
          );
        }
        pageSize = Math.min(config.pageSize, Math.max(1, page.pageSize || pageSize));
        totalMembers = Math.max(totalMembers, page.count);
        totalPages = Math.max(1, Math.ceil(totalMembers / pageSize));

        if (!page.list.length) {
          throw new Error(`增量刷新未读取到旧库边界 ${boundary.memberId}，未切换新增数据`);
        }

        const boundaryIndex = page.list.findIndex(
          (row) => readExternalMemberId(row) === boundary.memberId
        );
        const newRows = boundaryIndex >= 0 ? page.list.slice(0, boundaryIndex) : page.list;
        const persisted = newRows.length
          ? await deps.persistIncrementalPage(newRows, activeGeneration)
          : { persisted: 0, errors: 0 };
        job.progress = {
          currentPage: pageNo,
          pagesFetched: job.progress.pagesFetched + 1,
          totalPages,
          totalMembers,
          membersFetched: job.progress.membersFetched + newRows.length,
          membersPersisted: job.progress.membersPersisted + persisted.persisted,
          errors: job.progress.errors + persisted.errors,
          pageSize
        };
        checkpoint();

        if (boundaryIndex >= 0) {
          boundaryFound = true;
          earlyStopped = true;
          warnings.push(
            `第 ${pageNo} 页读取到旧库边界 ${boundary.memberId}，已停止抓取`
          );
          break;
        }

        if (page.list.length < pageSize) {
          throw new Error(`增量刷新未读取到旧库边界 ${boundary.memberId}，未切换新增数据`);
        }
        if (pageNo >= MAX_INCREMENTAL_PAGES) {
          throw new Error(
            `增量刷新超过安全页数 ${MAX_INCREMENTAL_PAGES}，仍未读取到旧库边界 ${boundary.memberId}`
          );
        }
        pageNo += 1;
      }

      if (!boundaryFound) {
        throw new Error(`增量刷新未读取到旧库边界 ${boundary.memberId}，未切换新增数据`);
      }

      if (job.progress.errors > 0) {
        throw new Error(`增量刷新有 ${job.progress.errors} 条记录未能持久化`);
      }

      job.status = 'done';
      job.result = { ...job.progress, warnings };
      checkpoint({ snapshotReady: true, incremental: true, earlyStopped, boundaryFound });
      logger.log(
        `会员目录增量完成 job=${job.jobId} pages=${job.progress.pagesFetched} persisted=${job.progress.membersPersisted} earlyStopped=${earlyStopped} errors=${job.progress.errors}`
      );
      return job.progress.membersPersisted;
    } catch (error: unknown) {
      job.status = 'error';
      job.error = error instanceof Error ? error.message : String(error);
      job.updatedAt = Date.now();
      checkpoint({ error: job.error });
      logger.warn(`会员目录增量失败 job=${job.jobId}: ${job.error}`);
      throw error;
    }
  };

  if (deps.jobRunner) {
    await deps.jobRunner.runJob(
      USER_CENTER_INCREMENTAL_JOB_NAME,
      execute,
      {
        refreshJobId: job.jobId,
        kind: 'incremental'
      },
      { persistMeta: true }
    );
    return;
  }
  await execute(() => undefined);
}
