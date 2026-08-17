import { describe, expect, it, vi } from 'vitest';
import { OperationWorkbenchService } from '../src/operation/operation-workbench.service';
import { buildWorkbenchPendingItems } from '../src/operation/operation-workbench.types';

describe('operation workbench pending items', () => {
  it('keeps only actionable items and preserves their destination', () => {
    const items = buildWorkbenchPendingItems({
      staleSkuCount: 4,
      draftCampaigns: 2,
      scheduledTasks: 0,
      failedTasks: 1,
      pendingOutbox: 0,
      failedJobs: 0
    });

    expect(items.map((item) => [item.key, item.count, item.route])).toEqual([
      ['inventory-warning', 4, '/zero-sales'],
      ['campaign-draft', 2, '/campaigns'],
      ['failed-task', 1, '/tasks']
    ]);
  });

  it('clamps invalid counts instead of showing negative work', () => {
    const items = buildWorkbenchPendingItems({
      staleSkuCount: -3,
      draftCampaigns: Number.NaN,
      scheduledTasks: 1.9,
      failedTasks: 0,
      pendingOutbox: 0,
      failedJobs: 0
    });

    expect(items.map((item) => [item.key, item.count])).toEqual([['scheduled-task', 1]]);
  });
});

describe('OperationWorkbenchService', () => {
  it('composes existing analytics and workflow sources into one payload', async () => {
    const gmv = {
      date: '2026-08-11',
      totalGmv: 123.45,
      totalGmvFen: 12345n,
      monthGmv: 123.45,
      monthGmvFen: 12345n,
      totalRefundFen: 100n,
      totalVerifyFen: 8000n,
      refundRate: 0.01,
      verifyRate: 0.5,
      paidOrderCount: 3,
      avgOrderValue: 41.15,
      dataSource: 'OrderHeader',
      updatedAt: '2026-08-11T00:00:00.000Z'
    } as never;
    const overview = {
      totalMerchants: 5,
      totalSkus: 20,
      zeroSalesMerchants: 2,
      zeroSalesSkuCount: 4,
      zeroSalesSkuRatio: 0.2,
      dataSource: 'ContentPackage'
    } as never;
    const prisma = {
      marketingCampaign: { count: vi.fn().mockResolvedValue(2) },
      distributionTask: {
        count: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1)
      },
      outboxEvent: { count: vi.fn().mockResolvedValue(1) },
      jobRun: { count: vi.fn().mockResolvedValue(0) }
    } as never;
    const service = new OperationWorkbenchService(
      prisma,
      { getKpis: vi.fn().mockResolvedValue(gmv), getTrend: vi.fn().mockResolvedValue([]) } as never,
      { getKpis: vi.fn().mockResolvedValue(overview) } as never
    );

    const result = await service.getWorkbench('2026-08-11');

    expect(result.date).toBe('2026-08-11');
    expect(result.updatedAt).toBe('2026-08-11T00:00:00.000Z');
    expect(result.kpis.gmv).toBe(gmv);
    expect(result.kpis.catalog.zeroSalesSkuCount).toBe(4);
    expect(result.pending.total).toBe(11);
    expect(result.pending.items.map((item) => item.key)).toEqual([
      'inventory-warning',
      'campaign-draft',
      'scheduled-task',
      'failed-task',
      'pending-outbox'
    ]);
  });

  it('passes the force flag to cache-backed analytics sources', async () => {
    const gmv = { date: '2026-08-11', updatedAt: null } as never;
    const getKpis = vi.fn().mockResolvedValue(gmv);
    const getTrend = vi.fn().mockResolvedValue([]);
    const getCatalogKpis = vi.fn().mockResolvedValue({
      totalMerchants: 0,
      totalSkus: 0,
      zeroSalesMerchants: 0,
      zeroSalesSkuCount: 0,
      zeroSalesSkuRatio: 0,
      dataSource: 'empty'
    });
    const prisma = {
      marketingCampaign: { count: vi.fn().mockResolvedValue(0) },
      distributionTask: { count: vi.fn().mockResolvedValue(0) },
      outboxEvent: { count: vi.fn().mockResolvedValue(0) },
      jobRun: { count: vi.fn().mockResolvedValue(0) }
    } as never;
    const service = new OperationWorkbenchService(
      prisma,
      { getKpis, getTrend } as never,
      { getKpis: getCatalogKpis } as never
    );

    await service.getWorkbench('2026-08-11', true);

    expect(getKpis).toHaveBeenCalledWith('2026-08-11', true);
    expect(getTrend).toHaveBeenCalledWith(7, '2026-08-11', true);
    expect(getCatalogKpis).toHaveBeenCalledWith('2026-08-11', true);
  });
});
