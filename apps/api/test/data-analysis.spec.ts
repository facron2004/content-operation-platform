import { describe, expect, it } from 'vitest';
import {
  fixedSnapshotWindows,
  paidTimeBounds,
  previousEqualWindow,
  resolveAnalysisWindow
} from '../src/data-analysis/data-analysis-window';
import {
  buildDataAnalysisWorkbook,
  buildExportFilename
} from '../src/data-analysis/data-analysis-excel';
import {
  buildDeltas,
  deltaRatio,
  mergePackageRankingByName,
  resolvePackageDisplayName
} from '../src/data-analysis/data-analysis-query';
import type { DataAnalysisReport } from '../src/data-analysis/data-analysis.dto';

describe('resolvePackageDisplayName', () => {
  it('keeps real package titles', () => {
    expect(resolvePackageDisplayName('悦得闲 | 4-5人餐', '2039148893979463680', '悦得闲')).toBe(
      '悦得闲 | 4-5人餐'
    );
  });

  it('never shows raw snowflake packageId as the label', () => {
    expect(resolvePackageDisplayName(null, '2079853368517627904', '悦得闲')).toBe(
      '悦得闲 · 套餐未同步'
    );
    expect(resolvePackageDisplayName('2079853368517627904', '2079853368517627904', '悦得闲')).toBe(
      '悦得闲 · 套餐未同步'
    );
    expect(resolvePackageDisplayName('', '2079853368517627904', null)).toBe('（未命名商品）');
  });
});

describe('mergePackageRankingByName', () => {
  it('merges same-title packageIds into one rank row', () => {
    const rows = mergePackageRankingByName(
      [
        {
          packageId: 'id-a',
          packageName: '悦得闲广式点心茶楼 | 200元代金券 低至一元享',
          merchantName: '悦得闲',
          orderCount: 352,
          salesAmount: 44937.34
        },
        {
          packageId: 'id-b',
          packageName: '悦得闲广式点心茶楼 | 200元代金券 低至一元享',
          merchantName: '悦得闲',
          orderCount: 166,
          salesAmount: 20215.6
        },
        {
          packageId: 'id-c',
          packageName: '悦得闲广式点心茶楼 | 4-5人餐 低至一元享',
          merchantName: '悦得闲',
          orderCount: 185,
          salesAmount: 28720.6
        }
      ],
      5
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rank: 1,
      packageName: '悦得闲广式点心茶楼 | 200元代金券 低至一元享',
      packageId: 'id-a', // highest-sales id kept as representative
      orderCount: 518,
      salesAmount: 65152.94
    });
    expect(rows[1]).toMatchObject({
      rank: 2,
      packageName: '悦得闲广式点心茶楼 | 4-5人餐 低至一元享',
      orderCount: 185
    });
  });
});

describe('data-analysis window', () => {
  it('resolves day to a single key', () => {
    expect(resolveAnalysisWindow('day', '2026-07-18')).toEqual({
      start: '2026-07-18',
      end: '2026-07-18'
    });
  });

  it('resolves year to trailing 90d (not full calendar year)', () => {
    // Interactive year is capped at DATA_ANALYSIS_READ_MAX_DAYS to prevent
    // full-year OrderHeader + Excel fan-out DoS.
    expect(resolveAnalysisWindow('year', '2026-07-18')).toEqual({
      start: '2026-04-20',
      end: '2026-07-18'
    });
  });

  it('caps multi-year custom week/month windows', () => {
    expect(() => resolveAnalysisWindow('month', '2020-01-01', '2026-07-22')).toThrow();
    expect(resolveAnalysisWindow('week', '2026-07-01', '2026-07-07')).toEqual({
      start: '2026-07-01',
      end: '2026-07-07'
    });
  });

  it('builds exclusive paidTime bounds for inclusive day range', () => {
    const one = paidTimeBounds('2026-07-21', '2026-07-21');
    expect(one.startBound < one.endBound).toBe(true);
    const multi = paidTimeBounds('2026-07-01', '2026-07-07');
    expect(multi.startBound < multi.endBound).toBe(true);
    expect(multi.startBound < one.startBound).toBe(true);
  });

  it('computes previous equal-length window', () => {
    expect(previousEqualWindow('2026-07-01', '2026-07-07')).toEqual({
      start: '2026-06-24',
      end: '2026-06-30'
    });
    expect(previousEqualWindow('2026-07-21', '2026-07-21')).toEqual({
      start: '2026-07-20',
      end: '2026-07-20'
    });
    const snaps = fixedSnapshotWindows('2026-07-23');
    expect(snaps.map((s) => s.key)).toEqual(['today', 'yesterday', 'last7', 'last30']);
    expect(snaps.find((s) => s.key === 'last7')).toMatchObject({
      start: '2026-07-17',
      end: '2026-07-23'
    });
  });
});

describe('data-analysis deltas', () => {
  it('computes ratio and nulls zero-previous', () => {
    expect(deltaRatio(10, 0)).toBeNull();
    expect(deltaRatio(12, 10)).toBeCloseTo(0.2);
    const empty = {
      orderCount: 0,
      salesAmount: 0,
      walletAmount: 0,
      tradeAmount: 0,
      netSales: 0,
      faceAmount: 0,
      refundAmount: 0,
      verifyAmount: 0,
      verifyRate: 0,
      refundRate: 0,
      settlementRate: 0,
      avgOrderValue: 0,
      targetRatio: 0,
      targetRatioWithWallet: 0,
      verifiedCount: 0,
      pendingVerifyCount: 0,
      expiredCount: 0,
      merchantCount: 0,
      salesmanCount: 0
    };
    const curr = { ...empty, salesAmount: 120, orderCount: 12, avgOrderValue: 10 };
    const prev = { ...empty, salesAmount: 100, orderCount: 10, avgOrderValue: 10 };
    const d = buildDeltas(curr, prev);
    expect(d.salesAmount).toBeCloseTo(0.2);
    expect(d.orderCount).toBeCloseTo(0.2);
    expect(d.avgOrderValue).toBeCloseTo(0);
  });
});

describe('data-analysis excel builder (砍价订单模板)', () => {
  const sample: DataAnalysisReport = {
    window: 'day',
    date: '2026-07-21',
    endDate: '2026-07-21',
    generatedAt: '2026-07-21T12:00:00.000Z',
    templateReady: true,
    overview: {
      orderCount: 3,
      salesAmount: 300,
      walletAmount: 20,
      tradeAmount: 320,
      netSales: 290,
      faceAmount: 400,
      refundAmount: 10,
      verifyAmount: 100,
      verifyRate: 0.3333,
      refundRate: 10 / 300,
      // verifyAmount includes wallet; denominator is tradeAmount (= sales + wallet)
      settlementRate: 100 / 320,
      avgOrderValue: 100,
      targetRatio: 300 / 33000,
      targetRatioWithWallet: 320 / 33000,
      verifiedCount: 1,
      pendingVerifyCount: 2,
      expiredCount: 0,
      merchantCount: 2,
      salesmanCount: 1
    },
    timeSlots: [
      {
        label: '午间 12-14',
        orderCount: 2,
        salesAmount: 200,
        verifiedCount: 1,
        verifyRate: 0.5
      }
    ],
    hourly: [{ hour: 12, orderCount: 2, salesAmount: 200 }],
    salesmen: [
      {
        rank: 1,
        name: '詹昌立',
        orderCount: 2,
        salesAmount: 200,
        faceAmount: 250,
        walletAmount: 10,
        refundAmount: 0,
        verifiedCount: 1,
        verifyRate: 0.5,
        avgOrderValue: 100
      }
    ],
    merchants: [
      {
        rank: 1,
        name: '测试商家',
        orderCount: 2,
        salesAmount: 200,
        faceAmount: 250,
        walletAmount: 10,
        refundAmount: 0,
        verifiedCount: 1,
        verifyRate: 0.5,
        avgOrderValue: 100
      }
    ],
    merchantVerifyLow: [{ name: '测试商家', orderCount: 2, verifyRate: 0.5 }],
    merchantVerifyHigh: [{ name: '测试商家', orderCount: 2, verifyRate: 0.5 }],
    salesmanVerifyLow: [{ name: '詹昌立', orderCount: 2, verifyRate: 0.5 }],
    salesmanVerifyHigh: [{ name: '詹昌立', orderCount: 2, verifyRate: 0.5 }],
    merchantRefunds: [],
    salesmanRefunds: [],
    details: [
      {
        merchantName: '测试商家',
        orderId: 'K2026072100001',
        packageName: '测试套餐',
        memberLabel: '138****0000',
        paidAmount: 100,
        orderAmount: 120,
        walletAmount: 0,
        pointUsed: 0,
        refundAmount: 0,
        coupon: '满80-10元券',
        salesman: '詹昌立',
        parentSalesman: '李健华',
        statusLabel: '已发货',
        orderType: '虚拟卡券',
        verifyLabel: '待核销',
        paidTime: '2026-07-21 12:00:00',
        verifyTime: ''
      }
    ],
    detailTruncated: false,
    limitations: []
  };

  it('builds a non-empty xlsx with template sheet names', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const buf = await buildDataAnalysisWorkbook(sample);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString('utf8')).toBe('PK');
    expect(buildExportFilename(sample)).toBe('砍价订单数据分析_20260721.xlsx');

    const wb = new ExcelJS.Workbook();
    // exceljs can fail on some media; write to buffer and re-read via load

    await (wb.xlsx as any).load(buf);
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      '总览',
      '时段分布',
      '业务员排行',
      '商家排行',
      '核销率分析',
      '退款分析',
      '订单明细'
    ]);
    expect(wb.getWorksheet('总览')?.getCell('A1').value).toBe('砍价订单数据分析报告');
    expect(wb.getWorksheet('订单明细')?.getRow(1).getCell(1).value).toBe('合作商');
  });
});
