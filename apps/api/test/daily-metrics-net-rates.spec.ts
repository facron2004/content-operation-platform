import { createClient, type InValue } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { recomputeDailyMetricsRange } from '../src/money/daily-metrics-recompute';

describe('DailyMetrics count rates with net GMV', () => {
  it('stores refund and verify rates against paid order counts', async () => {
    const client = createClient({ url: 'file::memory:' });
    try {
      await client.execute(`
        CREATE TABLE "OrderHeader" (
          "paidTime" TEXT,
          "paidAmountFen" INTEGER,
          "paidAmountWalletFen" INTEGER,
          "paidAmountBonusFen" INTEGER,
          "paidAmountCardFen" INTEGER,
          "verifyAmountFen" INTEGER,
          "refundAmountFen" INTEGER,
          "verifyTime" TEXT,
          "merchantId" TEXT
        )
      `);
      await client.execute(`
        CREATE TABLE "DailyMetrics" (
          "date" TEXT PRIMARY KEY,
          "totalGmvFen" INTEGER,
          "gmvOnlineFen" INTEGER,
          "gmvWalletFen" INTEGER,
          "gmvBonusFen" INTEGER,
          "gmvCardFen" INTEGER,
          "totalRefundFen" INTEGER,
          "totalVerifyFen" INTEGER,
          "totalOrders" INTEGER,
          "paidOrderCount" INTEGER,
          "verifyCount" INTEGER,
          "refundCount" INTEGER,
          "activeMerchants" INTEGER,
          "refundRate" REAL,
          "verifyRate" REAL,
          "updatedAt" TEXT
        )
      `);
      await client.execute({
        sql: `INSERT INTO "OrderHeader" (
          "paidTime", "paidAmountFen", "paidAmountWalletFen", "paidAmountBonusFen",
          "paidAmountCardFen", "verifyAmountFen", "refundAmountFen", "verifyTime", "merchantId"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          '2026-07-31 12:00:00',
          10000,
          0,
          0,
          10000,
          5000,
          2000,
          '2026-07-31 13:00:00',
          'merchant-1'
        ]
      });
      await client.execute({
        sql: `INSERT INTO "OrderHeader" (
          "paidTime", "paidAmountFen", "paidAmountWalletFen", "paidAmountBonusFen",
          "paidAmountCardFen", "verifyAmountFen", "refundAmountFen", "verifyTime", "merchantId"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ['2026-07-31 14:00:00', 5000, 0, 0, 5000, 999, 0, null, 'merchant-2']
      });

      const prisma = {
        $executeRawUnsafe: async (sql: string, ...values: unknown[]) =>
          (await client.execute({ sql, args: values as InValue[] })).rowsAffected
      };
      await recomputeDailyMetricsRange(prisma, '2026-07-31', '2026-07-31');

      const result = await client.execute(
        `SELECT "totalGmvFen", "totalRefundFen", "totalVerifyFen", "refundRate", "verifyRate" FROM "DailyMetrics"`
      );
      const row = result.rows[0];
      expect(Number(row?.totalGmvFen)).toBe(15000);
      expect(Number(row?.totalRefundFen)).toBe(2000);
      expect(Number(row?.totalVerifyFen)).toBe(5000);
      expect(Number(row?.refundRate)).toBeCloseTo(0.5);
      expect(Number(row?.verifyRate)).toBeCloseTo(0.5);
    } finally {
      await client.close();
    }
  });
});
