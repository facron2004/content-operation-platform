import { createClient, type InValue } from '@libsql/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeRefundTrendFromOrderHeader } from '../src/refund/refund-order-header';
import { fetchTopMerchantsRaw } from '../src/refund/refund-top-merchants';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('refund paidTime attribution', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the paidTime window when refundTime crosses the window boundary', async () => {
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
        "merchantName" TEXT
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
          0,
          'merchant-no-refund',
          '同日无退款商家'
        ]
      });

      const prisma = {
        $queryRawUnsafe: async <T = unknown>(sql: string, ...args: InValue[]) =>
          (await client.execute({ sql, args })).rows as T
      } as unknown as PrismaService;

      const rows = await fetchTopMerchantsRaw(prisma, 'refundDesc', '2026-07-02', '2026-07-08');

      expect(rows.map((row) => row.merchantId)).toEqual(['merchant-paid']);
      expect(Number(rows[0]?.refundFen)).toBe(10000);

      const verifyRows = await fetchTopMerchantsRaw(prisma, 'verifyDesc', '2026-07-02', '2026-07-08');
      expect(verifyRows.map((row) => row.merchantId)).toEqual(['merchant-verify']);
      expect(Number(verifyRows[0]?.verifyFen)).toBe(5000);

      const trend = await computeRefundTrendFromOrderHeader(prisma, '2026-07-02', '2026-07-08');
      const paidDay = trend.find((row) => row.date === '2026-07-03');
      expect(paidDay).toMatchObject({
        totalRefund: 100,
        refundCount: 1,
        paidOrderCount: 2
      });
      expect(paidDay?.refundRate).toBe(0.5);
      expect(trend.reduce((sum, row) => sum + row.totalRefund, 0)).toBe(100);
    } finally {
      await client.close();
    }
  });
});
