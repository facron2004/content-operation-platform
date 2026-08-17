import { describe, expect, it } from 'vitest';
import {
  getPartnerPickupPointRefreshJob,
  startPartnerPickupPointRefreshJob
} from '../src/finance-center/partner-pickup-point-refresh-job';
import type { JeeSitePartnerAccountQuery } from '../src/finance-center/jeesite-partner-account.client';

const waitForTerminal = async (jobId: string) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = getPartnerPickupPointRefreshJob(jobId);
    if (job?.status === 'done' || job?.status === 'error') return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('刷新任务未在测试窗口内结束');
};

describe('partner pickup-point refresh job', () => {
  it('reads pages serially and finalizes only after the complete snapshot is persisted', async () => {
    const previousPageSize = process.env.PARTNER_ACCOUNT_REFRESH_PAGE_SIZE;
    const previousInterval = process.env.PARTNER_ACCOUNT_REFRESH_INTERVAL_MS;
    process.env.PARTNER_ACCOUNT_REFRESH_PAGE_SIZE = '2';
    process.env.PARTNER_ACCOUNT_REFRESH_INTERVAL_MS = '0';
    try {
      const pages = [
        {
          pageNo: 1,
          pageSize: 2,
          count: 5,
          list: [
            { id: '1', corePartnerId: 'merchant-1', availableCommodityPoint: '10', state: 1 },
            { id: '2', corePartnerId: 'merchant-2', availableCommodityPoint: '20', state: 1 }
          ]
        },
        {
          pageNo: 2,
          pageSize: 2,
          count: 5,
          list: [
            { id: '3', corePartnerId: 'merchant-1', availableCommodityPoint: '5.5', state: 1 },
            { id: '4', corePartnerId: 'merchant-2', availableCommodityPoint: null, state: 2 }
          ]
        },
        {
          pageNo: 3,
          pageSize: 2,
          count: 5,
          list: [{ id: '5', corePartnerId: 'merchant-1', availableCommodityPoint: '1', state: 1 }]
        }
      ];
      const requestedPages: number[] = [];
      let persistedItems: Array<{ merchantId: string; availablePointCenti: bigint }> = [];
      let finalized = false;

      const job = startPartnerPickupPointRefreshJob({
        client: {
          listPartnerAccountRecords: async ({ page }: JeeSitePartnerAccountQuery) => {
            requestedPages.push(page);
            return pages[page - 1];
          }
        } as never,
        persistSnapshot: async (items) => {
          persistedItems = items.map((item) => ({
            merchantId: item.merchantId,
            availablePointCenti: item.availablePointCenti
          }));
          return { merchantsPersisted: items.length, errors: 0 };
        },
        finalizeSnapshot: async () => {
          finalized = true;
        }
      });

      const finished = await waitForTerminal(job.jobId);
      expect(finished?.status).toBe('done');
      expect(requestedPages).toEqual([1, 2, 3]);
      expect(finalized).toBe(true);
      expect(finished?.progress.recordsFetched).toBe(5);
      expect(persistedItems).toEqual([
        { merchantId: 'merchant-1', availablePointCenti: 1650n },
        { merchantId: 'merchant-2', availablePointCenti: 2000n }
      ]);
    } finally {
      if (previousPageSize === undefined) delete process.env.PARTNER_ACCOUNT_REFRESH_PAGE_SIZE;
      else process.env.PARTNER_ACCOUNT_REFRESH_PAGE_SIZE = previousPageSize;
      if (previousInterval === undefined) delete process.env.PARTNER_ACCOUNT_REFRESH_INTERVAL_MS;
      else process.env.PARTNER_ACCOUNT_REFRESH_INTERVAL_MS = previousInterval;
    }
  });

  it('keeps the job failed when a later page is empty', async () => {
    const previousPageSize = process.env.PARTNER_ACCOUNT_REFRESH_PAGE_SIZE;
    const previousInterval = process.env.PARTNER_ACCOUNT_REFRESH_INTERVAL_MS;
    process.env.PARTNER_ACCOUNT_REFRESH_PAGE_SIZE = '2';
    process.env.PARTNER_ACCOUNT_REFRESH_INTERVAL_MS = '0';
    try {
      let discarded = false;
      let finalized = false;
      const job = startPartnerPickupPointRefreshJob({
        client: {
          listPartnerAccountRecords: async ({ page }: JeeSitePartnerAccountQuery) =>
            page === 1
              ? {
                  pageNo: 1,
                  pageSize: 2,
                  count: 3,
                  list: [
                    { id: '1', corePartnerId: 'merchant-1', availableCommodityPoint: 1, state: 1 },
                    { id: '2', corePartnerId: 'merchant-1', availableCommodityPoint: 1, state: 1 }
                  ]
                }
              : { pageNo: page, pageSize: 2, count: 3, list: [] }
        } as never,
        persistSnapshot: async () => ({ merchantsPersisted: 0, errors: 0 }),
        finalizeSnapshot: async () => {
          finalized = true;
        },
        discardSnapshot: async () => {
          discarded = true;
        }
      });

      const finished = await waitForTerminal(job.jobId);
      expect(finished?.status).toBe('error');
      expect(finalized).toBe(false);
      expect(discarded).toBe(true);
    } finally {
      if (previousPageSize === undefined) delete process.env.PARTNER_ACCOUNT_REFRESH_PAGE_SIZE;
      else process.env.PARTNER_ACCOUNT_REFRESH_PAGE_SIZE = previousPageSize;
      if (previousInterval === undefined) delete process.env.PARTNER_ACCOUNT_REFRESH_INTERVAL_MS;
      else process.env.PARTNER_ACCOUNT_REFRESH_INTERVAL_MS = previousInterval;
    }
  });
});
