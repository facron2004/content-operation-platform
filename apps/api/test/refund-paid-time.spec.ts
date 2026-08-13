import { createClient, type InValue } from '@libsql/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeVerifyFromOrderHeader,
  computeRefundTrendFromOrderHeader,
  computeVerifyTrendFromOrderHeader,
  queryTopMerchantsByMetric
} from '../src/refund/refund-order-header';
import { fetchTopMerchantsRaw } from '../src/refund/refund-top-merchants';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('refund paidTime attribution', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the paidTime window when refundTime or verifyTime crosses the window boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T04:00:00.000Z'));

    const client = createClient({ url: 'file::memory:?cache=shared' });
    try {
      await client.execute(`
      CREATE TABLE "OrderHeader" (
        "orderId" TEXT PRIMARY KEY,
        "orderTime" TEXT,
        "paidTime" TEXT,
        "refundTime" TEXT,
        "refundAmountFen" INTEGER,
        "paidAmountFen" INTEGER,
        "paidAmountWalletFen" INTEGER,
        "verifyTime" TEXT,
        "verifyAmountFen" INTEGER,
        "merchantId" TEXT,
        "merchantName" TEXT,
        "updatedAt" TEXT DEFAULT '2026-07-08 00:00:00'
      )
    `);
      await client.execute({
        sql: `INSERT INTO "OrderHeader" (
        "orderId", "orderTime", "paidTime", "refundTime", "refundAmountFen", "paidAmountFen",
        "paidAmountWalletFen", "verifyTime", "verifyAmountFen", "merchantId", "merchantName"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'paid-in-window',
          '2026-07-01 12:00:00',
          '2026-07-03 12:00:00',
          '2026-07-09 12:00:00',
          10000,
          12000,
          0,
          null,
          0,
          'merchant-paid',
          '按支付时间商家'
        ]
      });
      await client.execute({
        sql: `INSERT INTO "OrderHeader" (
        "orderId", "orderTime", "paidTime", "refundTime", "refundAmountFen", "paidAmountFen",
        "paidAmountWalletFen", "verifyTime", "verifyAmountFen", "merchantId", "merchantName"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'ordered-in-window',
          '2026-07-03 12:00:00',
          '2026-07-01 12:00:00',
          '2026-07-04 12:00:00',
          90000,
          92000,
          0,
          null,
          0,
          'merchant-order',
          '仅下单时间商家'
        ]
      });
      await client.execute({
        sql: `INSERT INTO "OrderHeader" (
        "orderId", "orderTime", "paidTime", "refundTime", "refundAmountFen", "paidAmountFen",
        "paidAmountWalletFen", "verifyTime", "verifyAmountFen", "merchantId", "merchantName"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'verified-no-refund',
          '2026-07-03 12:00:00',
          '2026-07-04 12:00:00',
          null,
          0,
          5000,
          0,
          '2026-07-04 13:00:00',
          5000,
          'merchant-verify',
          '仅核销商家'
        ]
      });
      await client.execute({
        sql: `INSERT INTO "OrderHeader" (
        "orderId", "orderTime", "paidTime", "refundTime", "refundAmountFen", "paidAmountFen",
        "paidAmountWalletFen", "verifyTime", "verifyAmountFen", "merchantId", "merchantName"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'paid-no-refund',
          '2026-07-01 12:00:00',
          '2026-07-03 15:00:00',
          null,
          0,
          100000,
          0,
          null,
          999,
          'merchant-no-refund',
          '同日无退款商家'
        ]
      });
      await client.execute({
        sql: `INSERT INTO "OrderHeader" (
        "orderId", "orderTime", "paidTime", "refundTime", "refundAmountFen", "paidAmountFen",
        "paidAmountWalletFen", "verifyTime", "verifyAmountFen", "merchantId", "merchantName"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'paid-verify-later',
          '2026-07-03 15:00:00',
          '2026-07-03 15:00:00',
          null,
          0,
          6000,
          0,
          '2026-07-09 12:00:00',
          4000,
          'merchant-paid-verify-later',
          '支付窗口内后续核销'
        ]
      });
      await client.execute({
        sql: `INSERT INTO "OrderHeader" (
        "orderId", "orderTime", "paidTime", "refundTime", "refundAmountFen", "paidAmountFen",
        "paidAmountWalletFen", "verifyTime", "verifyAmountFen", "merchantId", "merchantName"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'verify-paid-earlier',
          '2026-07-01 15:00:00',
          '2026-07-01 15:00:00',
          null,
          0,
          7000,
          0,
          '2026-07-04 12:00:00',
          7000,
          'merchant-verify-paid-earlier',
          '仅核销时间商家'
        ]
      });

      const prisma = {
        $queryRawUnsafe: async <T = unknown>(sql: string, ...args: InValue[]) =>
          (await client.execute({ sql, args })).rows as T
      } as unknown as PrismaService;

      const rows = await fetchTopMerchantsRaw(prisma, 'refundDesc', '2026-07-02', '2026-07-08');

      expect(rows.map((row) => row.merchantId)).toEqual(['merchant-paid']);
      expect(Number(rows[0]?.refundFen)).toBe(10000);

      const verifyRows = await fetchTopMerchantsRaw(
        prisma,
        'verifyDesc',
        '2026-07-02',
        '2026-07-08'
      );
      expect(verifyRows.map((row) => row.merchantId)).toEqual([
        'merchant-verify',
        'merchant-paid-verify-later'
      ]);
      expect(Number(verifyRows[0]?.verifyFen)).toBe(5000);

      const verifyKpi = await computeVerifyFromOrderHeader(
        prisma,
        { start: '2026-07-02', end: '2026-07-08' },
        async () => []
      );
      expect(verifyKpi).toMatchObject({
        totalVerify: 90,
        verifyCount: 2,
        paidOrderCount: 4,
        verifyRate: 0.5,
        updatedAt: '2026-07-08T00:00:00.000Z'
      });

      const verifyTrend = await computeVerifyTrendFromOrderHeader(
        prisma,
        '2026-07-02',
        '2026-07-08'
      );
      expect(verifyTrend.find((row) => row.date === '2026-07-03')).toMatchObject({
        totalVerify: 40,
        verifyCount: 1,
        paidOrderCount: 3,
        verifyRate: 0.3333
      });
      expect(verifyTrend.find((row) => row.date === '2026-07-04')).toMatchObject({
        totalVerify: 50,
        verifyCount: 1,
        paidOrderCount: 1,
        verifyRate: 1
      });

      const trend = await computeRefundTrendFromOrderHeader(prisma, '2026-07-02', '2026-07-08');
      const paidDay = trend.find((row) => row.date === '2026-07-03');
      expect(paidDay).toMatchObject({
        totalRefund: 100,
        refundCount: 1,
        paidOrderCount: 3
      });
      expect(paidDay?.refundRate).toBe(0.3333);
      expect(trend.reduce((sum, row) => sum + row.totalRefund, 0)).toBe(100);
    } finally {
      await client.close();
    }
  });

  it('keeps mixed-order merchants when the metric is aggregated in HAVING', async () => {
    const client = createClient({ url: 'file::memory:' });
    try {
      await client.execute(`
      CREATE TABLE "OrderHeader" (
        "orderId" TEXT PRIMARY KEY,
        "paidTime" TEXT,
        "refundAmountFen" INTEGER,
        "paidAmountFen" INTEGER,
        "paidAmountWalletFen" INTEGER,
        "verifyTime" TEXT,
        "verifyAmountFen" INTEGER,
        "merchantId" TEXT,
        "merchantName" TEXT
      )
    `);
      const rows = [
        [
          'refund-zero-first',
          '2026-07-03 09:00:00',
          0,
          5000,
          null,
          null,
          0,
          'merchant-mixed',
          '混合退款商家'
        ],
        [
          'refund-positive',
          '2026-07-03 10:00:00',
          1200,
          5000,
          null,
          null,
          0,
          'merchant-mixed',
          '混合退款商家'
        ],
        [
          'verify-zero-first',
          '2026-07-03 11:00:00',
          0,
          5000,
          null,
          '2026-07-03 12:00:00',
          0,
          'merchant-verify-mixed',
          '混合核销商家'
        ],
        [
          'verify-positive',
          '2026-07-03 13:00:00',
          0,
          5000,
          null,
          '2026-07-03 14:00:00',
          900,
          'merchant-verify-mixed',
          '混合核销商家'
        ]
      ];
      for (const row of rows) {
        await client.execute({
          sql: `INSERT INTO "OrderHeader" ("orderId", "paidTime", "refundAmountFen", "paidAmountFen", "paidAmountWalletFen", "verifyTime", "verifyAmountFen", "merchantId", "merchantName") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: row
        });
      }

      const prisma = {
        $queryRawUnsafe: async <T = unknown>(sql: string, ...args: InValue[]) =>
          (await client.execute({ sql, args })).rows as T
      } as unknown as PrismaService;

      const refundRows = await fetchTopMerchantsRaw(
        prisma,
        'refundDesc',
        '2026-07-03',
        '2026-07-03'
      );
      expect(refundRows).toHaveLength(1);
      expect(refundRows[0]).toMatchObject({ merchantId: 'merchant-mixed', refundFen: 1200 });

      const verifyRows = await fetchTopMerchantsRaw(
        prisma,
        'verifyDesc',
        '2026-07-03',
        '2026-07-03'
      );
      expect(verifyRows).toHaveLength(1);
      expect(verifyRows[0]).toMatchObject({
        merchantId: 'merchant-verify-mixed',
        verifyFen: 900
      });

      const topRefundRows = await queryTopMerchantsByMetric(
        prisma,
        { start: '2026-07-03', end: '2026-07-03' },
        5,
        { amountColumn: 'refundAmountFen', amountAlias: 'refundFen' }
      );
      expect(topRefundRows.map((row) => row.merchantId)).toEqual(['merchant-mixed']);

      const topVerifyRows = await queryTopMerchantsByMetric(
        prisma,
        { start: '2026-07-03', end: '2026-07-03' },
        5,
        { amountColumn: 'verifyAmountFen', amountAlias: 'verifyFen' }
      );
      expect(topVerifyRows.map((row) => row.merchantId)).toEqual(['merchant-verify-mixed']);
    } finally {
      await client.close();
    }
  });
});
