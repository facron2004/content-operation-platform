import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  JeeSiteMemberClient,
  JeeSiteMemberPage
} from '../src/user-center/jeesite-member.client';
import {
  getUserCenterRefreshJob,
  startUserCenterRefreshJob
} from '../src/user-center/user-center-refresh-job';

const previousInterval = process.env.USER_CENTER_REFRESH_INTERVAL_MS;
const previousPageSize = process.env.USER_CENTER_REFRESH_PAGE_SIZE;

afterEach(() => {
  vi.restoreAllMocks();
  if (previousInterval === undefined) delete process.env.USER_CENTER_REFRESH_INTERVAL_MS;
  else process.env.USER_CENTER_REFRESH_INTERVAL_MS = previousInterval;
  if (previousPageSize === undefined) delete process.env.USER_CENTER_REFRESH_PAGE_SIZE;
  else process.env.USER_CENTER_REFRESH_PAGE_SIZE = previousPageSize;
});

async function waitForTerminal(jobId: string) {
  await vi.waitFor(() => {
    const job = getUserCenterRefreshJob(jobId);
    expect(['done', 'error', 'interrupted']).toContain(job?.status);
  });
  return getUserCenterRefreshJob(jobId)!;
}

function createClient(listMembers: JeeSiteMemberClient['listMembers']) {
  return { listMembers } as unknown as JeeSiteMemberClient;
}

describe('user center refresh job', () => {
  it('fetches and persists directory pages serially', async () => {
    process.env.USER_CENTER_REFRESH_INTERVAL_MS = '0';
    process.env.USER_CENTER_REFRESH_PAGE_SIZE = '2';
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const listMembers = vi.fn(async ({ page }: { page: number }) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;
      return {
        pageNo: page,
        pageSize: 2,
        count: 3,
        list: page === 1 ? [{ id: 'member-1' }, { id: 'member-2' }] : [{ id: 'member-3' }]
      };
    });
    const persistPage = vi.fn().mockResolvedValue({ persisted: 2, errors: 0 });
    const prepareSnapshot = vi.fn().mockResolvedValue(undefined);
    const finalizeSnapshot = vi.fn().mockResolvedValue(undefined);

    const job = startUserCenterRefreshJob({
      client: createClient(listMembers),
      prepareSnapshot,
      persistPage,
      finalizeSnapshot
    });
    const finished = await waitForTerminal(job.jobId);

    expect(finished.status).toBe('done');
    expect(maxActiveRequests).toBe(1);
    expect(listMembers).toHaveBeenCalledTimes(2);
    expect(persistPage).toHaveBeenCalledTimes(2);
    expect(prepareSnapshot).toHaveBeenCalledWith(job.generation);
    expect(finalizeSnapshot).toHaveBeenCalledWith(job.generation);
    expect(finished.progress).toMatchObject({
      pagesFetched: 2,
      membersFetched: 3,
      membersPersisted: 4,
      errors: 0
    });
  });

  it('deduplicates a second refresh request while one is active', async () => {
    process.env.USER_CENTER_REFRESH_INTERVAL_MS = '0';
    process.env.USER_CENTER_REFRESH_PAGE_SIZE = '10';
    let releasePage: (() => void) | undefined;
    const listMembers = vi.fn(
      () =>
        new Promise<JeeSiteMemberPage>((resolve) => {
          releasePage = () =>
            resolve({ pageNo: 1, pageSize: 10, count: 1, list: [{ id: 'member-1' }] });
        })
    );
    const deps = {
      client: createClient(listMembers),
      persistPage: vi.fn().mockResolvedValue({ persisted: 1, errors: 0 })
    };

    const first = startUserCenterRefreshJob(deps);
    const second = startUserCenterRefreshJob(deps);
    expect(second.jobId).toBe(first.jobId);
    releasePage?.();
    await waitForTerminal(first.jobId);

    expect(listMembers).toHaveBeenCalledTimes(1);
  });

  it('marks the job failed without asking the caller to delete old data', async () => {
    process.env.USER_CENTER_REFRESH_INTERVAL_MS = '0';
    process.env.USER_CENTER_REFRESH_PAGE_SIZE = '1';
    const listMembers = vi
      .fn()
      .mockResolvedValueOnce({ pageNo: 1, pageSize: 1, count: 2, list: [{ id: 'member-1' }] })
      .mockRejectedValueOnce(new Error('upstream timeout'));
    const persistPage = vi.fn().mockResolvedValue({ persisted: 1, errors: 0 });

    const job = startUserCenterRefreshJob({
      client: createClient(listMembers),
      persistPage
    });
    const finished = await waitForTerminal(job.jobId);

    expect(finished.status).toBe('error');
    expect(finished.error).toContain('upstream timeout');
    expect(persistPage).toHaveBeenCalledTimes(1);
  });

  it('does not replace the old snapshot when the source reports an empty first page', async () => {
    process.env.USER_CENTER_REFRESH_INTERVAL_MS = '0';
    process.env.USER_CENTER_REFRESH_PAGE_SIZE = '500';
    const listMembers = vi.fn().mockResolvedValue({ pageNo: 1, pageSize: 500, count: 0, list: [] });
    const persistPage = vi.fn();

    const job = startUserCenterRefreshJob({
      client: createClient(listMembers),
      persistPage
    });
    const finished = await waitForTerminal(job.jobId);

    expect(finished.status).toBe('error');
    expect(finished.error).toContain('0 条');
    expect(persistPage).not.toHaveBeenCalled();
  });

  it('does not accept a short middle page as a complete snapshot', async () => {
    process.env.USER_CENTER_REFRESH_INTERVAL_MS = '0';
    process.env.USER_CENTER_REFRESH_PAGE_SIZE = '2';
    const listMembers = vi
      .fn()
      .mockResolvedValueOnce({
        pageNo: 1,
        pageSize: 2,
        count: 5,
        list: [{ id: 'member-1' }, { id: 'member-2' }]
      })
      .mockResolvedValueOnce({ pageNo: 2, pageSize: 2, count: 5, list: [{ id: 'member-3' }] });
    const persistPage = vi.fn().mockResolvedValue({ persisted: 1, errors: 0 });

    const job = startUserCenterRefreshJob({
      client: createClient(listMembers),
      persistPage
    });
    const finished = await waitForTerminal(job.jobId);

    expect(finished.status).toBe('error');
    expect(finished.error).toContain('刷新未完成');
    expect(persistPage).toHaveBeenCalledTimes(2);
  });
});
