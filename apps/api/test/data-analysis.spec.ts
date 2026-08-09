import { describe, expect, it } from 'vitest';
import { createClient, type InValue } from '@libsql/client';
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
  resolvePackageDisplayName,
  queryDailyTrend,
  queryMerchantRanking,
  queryMerchantRefunds,
  queryOverview,
  querySalesmanRefunds
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

describe('data-analysis refund paidTime attribution', () => {
  it('uses paidTime and sums paid plus balance components regardless of refundTime', async () => {
    const client = createClient({ url: 'file::memory:?cache=shared' });
    await client.execute(`
      CREATE TABLE "OrderHeader" (
        "orderId" TEXT PRIMARY KEY,
        "orderTime" TEXT,
        "paidTime" TEXT,
        "refundTime" TEXT,
        "status" TEXT,
        "paidAmountFen" INTEGER,
        "paidAmountWalletFen" INTEGER,
        "orderAmountFen" INTEGER,
        "refundAmountFen" INTEGER,
        "verifyAmountFen" INTEGER,
        "verifyTime" TEXT,
        "merchantName" TEXT,
        "salesman" TEXT,
        "channel" TEXT,
        "packageId" TEXT
      )
    `);
    await client.execute({
      sql: `INSERT INTO "OrderHeader" (
        "orderId", "orderTime", "paidTime", "refundTime", "status",
        "paidAmountFen", "paidAmountWalletFen", "orderAmountFen", "refundAmountFen",
        "verifyAmountFen", "verifyTime", "merchantName", "salesman", "channel", "packageId"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'paid-in-range',
        '2026-07-01 15:59:00',
        '2026-07-01 16:01:00',
        '2026-07-02 01:00:00',
        'refunded',
        9500,
        500,
        12000,
        12000,
        0,
        null,
        '商家A',
        '业务员A',
        'jeesite',
        'package-a'
      ]
    });
    await client.execute({
      sql: `INSERT INTO "OrderHeader" (
        "orderId", "orderTime", "paidTime", "refundTime", "status",
        "paidAmountFen", "paidAmountWalletFen", "orderAmountFen", "refundAmountFen",
        "verifyAmountFen", "verifyTime", "merchantName", "salesman", "channel", "packageId"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'order-in-range-paid-out',
        '2026-07-01 16:01:00',
        '2026-07-02 16:01:00',
        '2026-07-02 02:00:00',
        'refunded',
        20000,
        0,
        22000,
        5000,
        0,
        null,
        '商家B',
        '业务员B',
        'jeesite',
        'package-b'
      ]
    });
    await client.execute({
      sql: `INSERT INTO "OrderHeader" (
        "orderId", "orderTime", "paidTime", "refundTime", "status",
        "paidAmountFen", "paidAmountWalletFen", "orderAmountFen", "refundAmountFen",
        "verifyAmountFen", "verifyTime", "merchantName", "salesman", "channel", "packageId"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'paid-in-range-refund-out',
        '2026-07-01 16:02:00',
        '2026-07-01 16:02:00',
        '2026-07-03 00:00:00',
        'refunded',
        700,
        0,
        8000,
        700,
        0,
        null,
        '商家C',
        '业务员C',
        'jeesite',
        'package-c'
      ]
    });

    const prisma = {
      $queryRawUnsafe: async <T = unknown>(sql: string, ...args: InValue[]) =>
        (await client.execute({ sql, args })).rows as T
    };

    try {
      const overview = await queryOverview(prisma, '2026-07-02', '2026-07-02');
      expect(overview).toMatchObject({
        orderCount: 2,
        salesAmount: 102,
        walletAmount: 5,
        tradeAmount: 107,
        netGmv: 0,
        refundAmount: 107,
        // Both fixture orders are unverified (verifyTime IS NULL).
        writeOffAmount: 0
      });

      await expect(queryDailyTrend(prisma, '2026-07-02', '2026-07-02')).resolves.toEqual([
        {
          date: '2026-07-02',
          salesAmount: 102,
          tradeAmount: 107,
          netGmv: 0,
          writeOffAmount: 0,
          orderCount: 2,
          refundAmount: 107
        }
      ]);

      await expect(queryMerchantRefunds(prisma, '2026-07-02', '2026-07-02', 10)).resolves.toEqual([
        { name: '商家A', orderCount: 1, refundAmount: 100, verifyRate: 0 },
        { name: '商家C', orderCount: 1, refundAmount: 7, verifyRate: 0 }
      ]);
      await expect(querySalesmanRefunds(prisma, '2026-07-02', '2026-07-02', 10)).resolves.toEqual([
        { name: '业务员A', orderCount: 1, refundAmount: 100, verifyRate: 0 },
        { name: '业务员C', orderCount: 1, refundAmount: 7, verifyRate: 0 }
      ]);

      await expect(queryMerchantRanking(prisma, '2026-07-02', '2026-07-02', 10)).resolves.toEqual([
        expect.objectContaining({ name: '商家A', refundAmount: 100 }),
        expect.objectContaining({ name: '商家C', refundAmount: 7 })
      ]);
    } finally {
      await client.close();
    }
  });
});

describe('data-analysis 核销额口径(已核销子集)', () => {
  it('核销额 = 已核销(verified)订单的 余额+现金，按 paidTime 归算', async () => {
    // 独立命名的内存库，避免与同 worker 内其它用例共享的 cache=shared 内存库冲突。
    const client = createClient({ url: 'file::memory:' });
    await client.execute(`
      CREATE TABLE "OrderHeader" (
        "orderId" TEXT PRIMARY KEY,
        "orderTime" TEXT,
        "paidTime" TEXT,
        "refundTime" TEXT,
        "status" TEXT,
        "paidAmountFen" INTEGER,
        "paidAmountWalletFen" INTEGER,
        "orderAmountFen" INTEGER,
        "refundAmountFen" INTEGER,
        "verifyAmountFen" INTEGER,
        "verifyTime" TEXT,
        "merchantName" TEXT,
        "salesman" TEXT,
        "channel" TEXT,
        "packageId" TEXT
      )
    `);
    const insert = (args: InValue[]) =>
      client.execute({
        sql: `INSERT INTO "OrderHeader" (
          "orderId", "orderTime", "paidTime", "refundTime", "status",
          "paidAmountFen", "paidAmountWalletFen", "orderAmountFen", "refundAmountFen",
          "verifyAmountFen", "verifyTime", "merchantName", "salesman", "channel", "packageId"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args
      });
    // 窗口 2026-07-02：A 已核销(余额+现金=100+5=105)，B 未核销但残留 verifyAmount 不应计入；C 已核销但 paidTime 在窗口外(07-01 15:00)。
    await insert([
      'A',
      '2026-07-02 15:00:00',
      '2026-07-01 16:01:00',
      null,
      'verified',
      10000,
      500,
      11000,
      0,
      10500,
      '2026-07-02 18:00:00',
      '商家A',
      '业务员A',
      'wechat',
      'p-a'
    ]);
    await insert([
      'B',
      '2026-07-02 15:30:00',
      '2026-07-01 16:02:00',
      null,
      'paid',
      20000,
      0,
      22000,
      0,
      999,
      null,
      '商家B',
      '业务员B',
      'wechat',
      'p-b'
    ]);
    await insert([
      'C',
      '2026-07-01 15:00:00',
      '2026-07-01 15:00:00',
      null,
      'verified',
      40000,
      1000,
      42000,
      0,
      41000,
      '2026-07-01 18:00:00',
      '商家C',
      '业务员C',
      'wechat',
      'p-c'
    ]);

    const prisma = {
      $queryRawUnsafe: async <T = unknown>(sql: string, ...args: InValue[]) =>
        (await client.execute({ sql, args })).rows as T
    };
    try {
      const ov = await queryOverview(prisma, '2026-07-02', '2026-07-02');
      expect(ov.orderCount).toBe(2);
      expect(ov.tradeAmount).toBe(305); // A(105) + B(200)
      // 仅已核销订单(A)的余额+现金计入核销额，未核销(B)与窗口外已核销(C)均不计入
      expect(ov.writeOffAmount).toBe(105);
      expect(ov.verifyAmount).toBe(105);
      expect(ov.netGmv).toBe(305);
    } finally {
      await client.close();
    }
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
      netGmv: 0,
      writeOffAmount: 0,
      faceAmount: 0,
      refundAmount: 0,
      verifyAmount: 0,
      verifyRate: 0,
      refundRate: 0,
      refundCount: 0,
      settlementRate: 0,
      avgOrderValue: 0,
      targetRatio: 0,
      targetRatioWithWallet: 0,
      netGmvTargetRatio: 0,
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
      netGmv: 310,
      writeOffAmount: 320,
      faceAmount: 400,
      refundAmount: 10,
      verifyAmount: 100,
      verifyRate: 0.3333,
      refundRate: 10 / 300,
      refundCount: 0,
      // verifyAmount includes wallet; denominator is tradeAmount (= sales + wallet)
      settlementRate: 100 / 320,
      avgOrderValue: 100,
      targetRatio: 300 / 33000,
      targetRatioWithWallet: 320 / 33000,
      netGmvTargetRatio: 310 / 33000,
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
