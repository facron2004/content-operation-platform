import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  JeeSiteMemberClient,
  JeeSiteMemberRow
} from '../src/user-center/jeesite-member.client';
import {
  getUserCenterRefreshJob,
  startUserCenterIncrementalRefreshJob,
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

describe('user center incremental refresh job', () => {
  it('stops at the latest old record and persists only rows before it', async () => {
    process.env.USER_CENTER_REFRESH_INTERVAL_MS = '0';
    process.env.USER_CENTER_REFRESH_PAGE_SIZE = '3';
    const watermark = new Date('2026-08-18T12:05:00.000Z');
    const listMembers = vi.fn(async ({ page }: { page: number }) => ({
      pageNo: page,
      pageSize: 3,
      count: 163833,
      // 外部默认按 createDate 降序；第 2 页读到本地最新旧记录后停止
      list:
        page === 1
          ? [
              { id: 'm-new-1', createDate: '2026-08-18 12:10:00' },
              { id: 'm-new-2', createDate: '2026-08-18 12:09:00' },
              { id: 'm-new-3', createDate: '2026-08-18 12:08:00' }
            ]
          : [
              { id: 'm-new-4', createDate: '2026-08-18 12:07:00' },
              { id: 'm-old-latest', createDate: '2026-08-18 12:05:00' },
              { id: 'm-old-after', createDate: '2026-08-18 12:04:00' }
            ]
    }));
    const persistIncrementalPage = vi.fn(
      async (rows: JeeSiteMemberRow[], _generation: string) => ({
        persisted: rows.length,
        errors: 0
      })
    );

    const job = startUserCenterIncrementalRefreshJob({
      client: createClient(listMembers),
      resolveActiveGeneration: () => Promise.resolve('gen-active'),
      loadLatestExistingMember: () =>
        Promise.resolve({ memberId: 'm-old-latest', sourceCreatedAt: watermark }),
      persistIncrementalPage
    });
    const finished = await waitForTerminal(job.jobId);

    expect(finished.kind).toBe('incremental');
    expect(finished.status).toBe('done');
    expect(listMembers).toHaveBeenCalledTimes(2);
    expect(persistIncrementalPage).toHaveBeenCalledTimes(2);
    expect(
      persistIncrementalPage.mock.calls.map(([rows]) =>
        rows.map((row) => String(row.id ?? row.memberId))
      )
    ).toEqual([
      ['m-new-1', 'm-new-2', 'm-new-3'],
      ['m-new-4']
    ]);
    expect(finished.progress).toMatchObject({
      pagesFetched: 2,
      membersFetched: 4,
      membersPersisted: 4,
      errors: 0
    });
    expect(finished.result?.warnings.some((w) => w.includes('旧库边界'))).toBe(true);
  });

  it('fails when no active generation is available', async () => {
    process.env.USER_CENTER_REFRESH_INTERVAL_MS = '0';
    const listMembers = vi.fn<JeeSiteMemberClient['listMembers']>();
    const job = startUserCenterIncrementalRefreshJob({
      client: createClient(listMembers),
      resolveActiveGeneration: () => Promise.resolve(null),
      loadLatestExistingMember: () => Promise.resolve(null),
      persistIncrementalPage: vi.fn()
    });
    const finished = await waitForTerminal(job.jobId);

    expect(finished.status).toBe('error');
    expect(finished.error).toContain('无活动会员目录快照');
    expect(listMembers).not.toHaveBeenCalled();
  });

  it('shares the mutual-exclusion lock with the full refresh job', async () => {
    process.env.USER_CENTER_REFRESH_INTERVAL_MS = '0';
    process.env.USER_CENTER_REFRESH_PAGE_SIZE = '2';
    let releasePage: (() => void) | undefined;
    const listMembers = vi.fn<JeeSiteMemberClient['listMembers']>(
      () =>
        new Promise((resolve) => {
          releasePage = () =>
            resolve({
              pageNo: 1,
              pageSize: 2,
              count: 2,
              list: [{ id: 'm-1', createDate: '2026-08-18 12:10:00' }, { id: 'm-2', createDate: '2026-08-18 12:09:00' }]
            });
        })
    );
    const persistIncrementalPage = vi.fn(
      async (rows: JeeSiteMemberRow[], _generation: string) => ({
        persisted: rows.length,
        errors: 0
      })
    );
    // 第 1 页包含旧库边界；releasePage 释放后增量完成
    const deps = {
      client: createClient(listMembers),
      resolveActiveGeneration: () => Promise.resolve('gen-active'),
      loadLatestExistingMember: () =>
        Promise.resolve({
          memberId: 'm-1',
          sourceCreatedAt: new Date('2026-08-18T12:20:00.000Z')
        }),
      persistIncrementalPage
    };

    const incremental = startUserCenterIncrementalRefreshJob(deps);
    // 等待增量进入 listMembers 调用（卡在 releasePage，此时 status=pulling，互斥生效）
    await vi.waitFor(() => expect(listMembers).toHaveBeenCalled());
    // 增量在跑时，全量请求应复用同一个活动 job（互斥去重）
    const full = startUserCenterRefreshJob({
      client: createClient(vi.fn<JeeSiteMemberClient['listMembers']>()),
      persistPage: vi.fn()
    });
    expect(full.jobId).toBe(incremental.jobId);
    expect(full.kind).toBe('incremental');
    releasePage?.();
    await waitForTerminal(incremental.jobId);
    expect(listMembers).toHaveBeenCalledTimes(1);
  });
});
