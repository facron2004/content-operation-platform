import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataAnalysisOverview } from '../src/data-analysis/data-analysis.dto';

const queryMocks = vi.hoisted(() => ({
  queryHourly: vi.fn(),
  queryMerchantRanking: vi.fn(),
  queryMerchantRefunds: vi.fn(),
  queryMerchantVerifyExtremes: vi.fn(),
  queryOrderDetails: vi.fn(),
  queryOverview: vi.fn(),
  querySalesmanRanking: vi.fn(),
  querySalesmanRefunds: vi.fn(),
  querySalesmanVerifyExtremes: vi.fn(),
  queryTimeSlots: vi.fn()
}));

vi.mock('../src/data-analysis/data-analysis-query', () => queryMocks);

import { buildDataAnalysisReport } from '../src/data-analysis/data-analysis-report';

const overview: DataAnalysisOverview = {
  orderCount: 2,
  salesAmount: 100,
  walletAmount: 10,
  tradeAmount: 110,
  netGmv: 100,
  netSales: 90,
  faceAmount: 120,
  refundAmount: 10,
  verifyAmount: 50,
  verifyRate: 0.5,
  refundRate: 0.1,
  refundCount: 0,
  settlementRate: 0.5,
  avgOrderValue: 50,
  targetRatio: 100 / 33000,
  targetRatioWithWallet: 110 / 33000,
  netGmvTargetRatio: 100 / 33000,
  verifiedCount: 1,
  pendingVerifyCount: 1,
  expiredCount: 0,
  merchantCount: 1,
  salesmanCount: 1
};

const prisma = { $queryRawUnsafe: vi.fn() };

describe('buildDataAnalysisReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMocks.queryOverview.mockResolvedValue(overview);
    queryMocks.queryTimeSlots.mockResolvedValue([]);
    queryMocks.queryHourly.mockResolvedValue([]);
    queryMocks.querySalesmanRanking.mockResolvedValue([]);
    queryMocks.queryMerchantRanking.mockResolvedValue([]);
    queryMocks.queryMerchantVerifyExtremes.mockResolvedValue({ low: [], high: [] });
    queryMocks.querySalesmanVerifyExtremes.mockResolvedValue({ low: [], high: [] });
    queryMocks.queryMerchantRefunds.mockResolvedValue([]);
    queryMocks.querySalesmanRefunds.mockResolvedValue([]);
    queryMocks.queryOrderDetails.mockResolvedValue({ rows: [], truncated: false });
  });

  it('orchestrates the paidTime report matrix and preserves summary-only detail omission', async () => {
    const report = await buildDataAnalysisReport(
      prisma,
      'day',
      '2026-07-21',
      '2026-07-21',
      100,
      50,
      { includeDetails: false, refundLimit: 7 }
    );

    expect(report).toMatchObject({
      window: 'day',
      date: '2026-07-21',
      endDate: '2026-07-21',
      overview,
      details: [],
      detailTruncated: false,
      templateReady: true
    });
    expect(queryMocks.queryOverview).toHaveBeenCalledWith(prisma, '2026-07-21', '2026-07-21');
    expect(queryMocks.queryMerchantRanking).toHaveBeenCalledWith(
      prisma,
      '2026-07-21',
      '2026-07-21',
      50
    );
    expect(queryMocks.queryMerchantRefunds).toHaveBeenCalledWith(
      prisma,
      '2026-07-21',
      '2026-07-21',
      7
    );
    expect(queryMocks.queryOrderDetails).not.toHaveBeenCalled();
  });

  it('includes details only for the export report path', async () => {
    const detail = { orderId: 'ORDER-1' };
    queryMocks.queryOrderDetails.mockResolvedValueOnce({ rows: [detail], truncated: true });

    const report = await buildDataAnalysisReport(
      prisma,
      'day',
      '2026-07-21',
      '2026-07-21',
      100,
      500,
      { includeDetails: true }
    );

    expect(queryMocks.queryOrderDetails).toHaveBeenCalledWith(
      prisma,
      '2026-07-21',
      '2026-07-21',
      100
    );
    expect(report.details).toEqual([detail]);
    expect(report.detailTruncated).toBe(true);
  });
});
