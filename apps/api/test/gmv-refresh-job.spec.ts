import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshGmvFromJeesite: vi.fn()
}));

vi.mock('../src/gmv/gmv-refresh', () => ({
  refreshGmvFromJeesite: mocks.refreshGmvFromJeesite
}));

import {
  getPersistedGmvRefreshJob,
  restoreGmvRefreshJob,
  startGmvRefreshJob,
  type GmvRefreshJobDeps,
  type GmvRefreshJobMetaSetter
} from '../src/gmv/gmv-refresh-job';
import type { JobRunRecord } from '../src/jobs/job-runner.service';

function refreshResult() {
  return {
    startDate: '2026-08-10',
    endDate: '2026-08-10',
    fetched: 2,
    upserted: 2,
    skipped: 0,
    errors: 0,
    pagesFetched: 1,
    truncated: false,
    pullWarnings: [],
    recomputeWarnings: []
  };
}

function createDeps(jobRunner: GmvRefreshJobDeps['jobRunner']): GmvRefreshJobDeps {
  return {
    prisma: {} as never,
    getMerchantSalesService: vi.fn().mockResolvedValue(null),
    invalidateCache: vi.fn(),
    getKpis: vi.fn().mockResolvedValue({ totalGmv: 200 }),
    jobRunner
  };
}

describe('GMV refresh JobRun integration', () => {
  beforeEach(() => {
    mocks.refreshGmvFromJeesite.mockReset().mockResolvedValue(refreshResult());
  });

  it('runs the async refresh through the JobRun runner and records summary metadata', async () => {
    const setMeta = vi.fn((_: Record<string, unknown>) => undefined);
    const jobRunner = {
      runJob: vi.fn(
        async (
          _jobName: string,
          jobFn: (setMeta: GmvRefreshJobMetaSetter) => Promise<number | void>
        ) => {
          await jobFn(setMeta);
        }
      )
    };
    const job = startGmvRefreshJob(createDeps(jobRunner), '2026-08-10', '2026-08-10');

    await vi.waitFor(() => expect(job.status).toBe('done'));

    expect(jobRunner.runJob).toHaveBeenCalledWith(
      'gmv-refresh',
      expect.any(Function),
      {
        refreshJobId: job.jobId,
        startDate: '2026-08-10',
        endDate: '2026-08-10'
      },
      { persistMeta: true }
    );
    expect(setMeta).toHaveBeenNthCalledWith(1, {
      refreshJobId: job.jobId,
      startDate: '2026-08-10',
      endDate: '2026-08-10',
      phase: 'pulling'
    });
    expect(setMeta).toHaveBeenNthCalledWith(2, { phase: 'finalizing' });
    expect(setMeta).toHaveBeenNthCalledWith(3, {
      fetched: 2,
      upserted: 2,
      skipped: 0,
      errors: 0,
      pagesFetched: 1,
      phase: 'finalizing',
      pullWarnings: [],
      pullWarningsCount: 0,
      recomputeWarnings: [],
      recomputeWarningsCount: 0
    });
    expect(job.result?.kpi).toEqual({ totalGmv: 200 });
  });

  it('checkpoints pull progress and recompute phase metadata', async () => {
    const setMeta = vi.fn((_: Record<string, unknown>) => undefined);
    const jobRunner = {
      runJob: vi.fn(
        async (
          _jobName: string,
          jobFn: (setMeta: GmvRefreshJobMetaSetter) => Promise<number | void>
        ) => {
          await jobFn(setMeta);
        }
      )
    };
    mocks.refreshGmvFromJeesite.mockImplementationOnce(
      async (params: {
        onProgress?: (progress: {
          pagesFetched: number;
          fetched: number;
          upserted: number;
          skipped: number;
          errors: number;
        }) => void;
        onPhase?: (phase: 'pull' | 'recompute') => void;
      }) => {
        params.onProgress?.({
          pagesFetched: 4,
          fetched: 200,
          upserted: 190,
          skipped: 8,
          errors: 2
        });
        params.onPhase?.('recompute');
        return refreshResult();
      }
    );

    const job = startGmvRefreshJob(createDeps(jobRunner), '2026-08-12', '2026-08-12');

    await vi.waitFor(() => expect(job.status).toBe('done'));

    expect(setMeta).toHaveBeenCalledWith({
      phase: 'pulling',
      pagesFetched: 4,
      fetched: 200,
      upserted: 190,
      skipped: 8,
      errors: 2
    });
    expect(setMeta).toHaveBeenCalledWith({ phase: 'recomputing' });
  });

  it('restores an interrupted job from persisted metadata after a process restart', () => {
    const restored = restoreGmvRefreshJob('refresh-restarted', {
      id: 'job_run_1',
      jobName: 'gmv-refresh',
      status: 'interrupted',
      startedAt: '2026-08-09 01:00:00',
      finishedAt: '2026-08-09 01:01:00',
      durationMs: null,
      itemsProcessed: 0,
      errorMessage: '进程异常退出，任务被中断；仅幂等任务允许重试',
      metaJson: JSON.stringify({
        refreshJobId: 'refresh-restarted',
        startDate: '2026-08-01',
        endDate: '2026-08-09',
        pagesFetched: 3,
        fetched: 120,
        upserted: 115
      }),
      createdAt: '2026-08-09 01:00:00'
    });

    expect(restored).toMatchObject({
      jobId: 'refresh-restarted',
      status: 'interrupted',
      startDate: '2026-08-01',
      endDate: '2026-08-09',
      progress: { pagesFetched: 3, fetched: 120, upserted: 115 },
      error: '进程异常退出，任务被中断；仅幂等任务允许重试'
    });
    expect(restored?.result).toBeUndefined();
  });

  it('loads the latest persisted refresh job through the JobRunner lookup', async () => {
    const run: JobRunRecord = {
      id: 'job_run_2',
      jobName: 'gmv-refresh',
      status: 'success',
      startedAt: '2026-08-09 02:00:00',
      finishedAt: '2026-08-09 02:00:10',
      durationMs: 10000,
      itemsProcessed: 4,
      errorMessage: null,
      metaJson: JSON.stringify({
        refreshJobId: 'refresh-persisted',
        startDate: '2026-08-09',
        endDate: '2026-08-09',
        fetched: 4,
        upserted: 4,
        pagesFetched: 1,
        pullWarnings: [],
        recomputeWarnings: []
      }),
      createdAt: '2026-08-09 02:00:00'
    };
    const findLatestByMeta = vi.fn().mockResolvedValue(run);

    await expect(
      getPersistedGmvRefreshJob('refresh-persisted', { findLatestByMeta, runJob: vi.fn() })
    ).resolves.toMatchObject({
      jobId: 'refresh-persisted',
      status: 'done',
      result: { fetched: 4, upserted: 4, pagesFetched: 1 }
    });
    expect(findLatestByMeta).toHaveBeenCalledWith(
      'gmv-refresh',
      'refreshJobId',
      'refresh-persisted'
    );
  });

  it('marks the polling job as error when the JobRun cannot be started', async () => {
    const jobRunner = {
      runJob: vi.fn().mockRejectedValue(new Error('JobRun unavailable'))
    };
    const job = startGmvRefreshJob(createDeps(jobRunner), '2026-08-11', '2026-08-11');

    await vi.waitFor(() => expect(job.status).toBe('error'));

    expect(job.error).toBe('JobRun unavailable');
    expect(mocks.refreshGmvFromJeesite).not.toHaveBeenCalled();
  });
});
