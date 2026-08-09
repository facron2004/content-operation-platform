import { createClient, type InValue } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { recomputeMerchantDailyMetrics } from '../src/merchant-sales/merchant-sales-metrics-query';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('MerchantDailyMetrics 核销额口径', () => {
  it('重算时不计入未核销订单的残留 verifyAmountFen', async () => {
    const client = createClient({ url: 'file::memory:' });
    try {
      await client.execute(`
        CREATE TABLE "OrderHeader" (
          "merchantName" TEXT,
          "areaName" TEXT,
          "paidTime" TEXT,
          "paidAmountFen" INTEGER,
          "paidAmountWalletFen" INTEGER,
          "paidAmountBonusFen" INTEGER,
          "paidAmountCardFen" INTEGER,
          "refundAmountFen" INTEGER,
          "verifyTime" TEXT,
          "verifyAmountFen" INTEGER,
          "packageId" TEXT
        )
      `);
      await client.execute(`
        CREATE TABLE "MerchantDailyMetrics" (
          "merchantName" TEXT,
          "date" TEXT,
          "areaName" TEXT,
          "paidOrderCount" INTEGER,
          "paidAmountOnlineFen" INTEGER,
          "paidAmountWalletFen" INTEGER,
          "paidAmountBonusFen" INTEGER,
          "paidAmountCardFen" INTEGER,
          "refundAmountFen" INTEGER,
          "verifyAmountFen" INTEGER,
          "orderCount" INTEGER,
          "packageCount" INTEGER,
          "refundCount" INTEGER,
          "verifyCount" INTEGER,
          "updatedAt" TEXT
        )
      `);
      const insert = (args: InValue[]) =>
        client.execute({
          sql: `INSERT INTO "OrderHeader" (
            "merchantName", "areaName", "paidTime", "paidAmountFen",
            "paidAmountWalletFen", "paidAmountBonusFen", "paidAmountCardFen",
            "refundAmountFen", "verifyTime", "verifyAmountFen", "packageId"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args
        });
      await insert([
        '商家A',
        '华东',
        '2026-07-03 01:00:00',
        10000,
        0,
        0,
        0,
        0,
        '2026-07-03 02:00:00',
        5000,
        'package-a'
      ]);
      await insert([
        '商家A',
        '华东',
        '2026-07-03 03:00:00',
        5000,
        0,
        0,
        0,
        0,
        null,
        999,
        'package-b'
      ]);

      const prisma = {
        $executeRawUnsafe: async (sql: string, ...args: InValue[]) =>
          (await client.execute({ sql, args })).rowsAffected
      } as unknown as PrismaService;
      await recomputeMerchantDailyMetrics(prisma, '2026-07-03', '2026-07-03');

      const result = await client.execute(
        `SELECT "paidOrderCount", "verifyAmountFen", "verifyCount", "orderCount"
         FROM "MerchantDailyMetrics"
         WHERE "merchantName" = ? AND "date" = ?`,
        ['商家A', '2026-07-03']
      );
      const row = result.rows[0];
      expect(Number(row?.paidOrderCount)).toBe(2);
      expect(Number(row?.verifyAmountFen)).toBe(5000);
      expect(Number(row?.verifyCount)).toBe(1);
      expect(Number(row?.orderCount)).toBe(2);
    } finally {
      await client.close();
    }
  });
});
