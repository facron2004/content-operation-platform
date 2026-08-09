import { createClient, type InValue } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import {
  loadMerchantSalesExportRows,
  queryExportCsv,
  querySummary,
  queryTrendRows
} from '../src/merchant-sales/merchant-sales-query';
import { sortColumn } from '../src/merchant-sales/merchant-sales-window';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('merchant-sales net GMV reads', () => {
  it('uses net GMV consistently in summary, trend, and export', async () => {
    const client = createClient({ url: 'file::memory:' });
    try {
      await client.execute(`
      CREATE TABLE "MerchantDailyMetrics" (
        "merchantName" TEXT NOT NULL,
        "date" TEXT NOT NULL,
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
        "verifyCount" INTEGER
      );
      `);
      await client.execute(`
      CREATE TABLE "OrderHeader" (
        "packageId" TEXT,
        "merchantName" TEXT,
        "paidTime" TEXT
      );
      `);
      await client.execute({
        sql: `INSERT INTO "MerchantDailyMetrics" (
        "merchantName", "date", "areaName", "paidOrderCount",
        "paidAmountOnlineFen", "paidAmountWalletFen", "paidAmountBonusFen",
        "paidAmountCardFen", "refundAmountFen", "verifyAmountFen",
        "orderCount", "packageCount", "refundCount", "verifyCount"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ['merchant-a', '2026-07-03', 'area-a', 1, 10000, 5000, 0, 0, 2000, 1000, 1, 1, 1, 1]
      });
      await client.execute({
        sql: `INSERT INTO "MerchantDailyMetrics" (
        "merchantName", "date", "areaName", "paidOrderCount",
        "paidAmountOnlineFen", "paidAmountWalletFen", "paidAmountBonusFen",
        "paidAmountCardFen", "refundAmountFen", "verifyAmountFen",
        "orderCount", "packageCount", "refundCount", "verifyCount"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ['merchant-b', '2026-07-03', 'area-b', 1, 8000, 0, 0, 0, 0, 0, 1, 1, 0, 0]
      });
      await client.execute({
        sql: 'INSERT INTO "OrderHeader" ("packageId", "merchantName", "paidTime") VALUES (?, ?, ?)',
        args: ['package-a', 'merchant-a', '2026-07-03 12:00:00']
      });
      await client.execute({
        sql: 'INSERT INTO "OrderHeader" ("packageId", "merchantName", "paidTime") VALUES (?, ?, ?)',
        args: ['package-b', 'merchant-b', '2026-07-03 13:00:00']
      });

      const prisma = {
        $queryRawUnsafe: async <T = unknown>(sql: string, ...args: InValue[]) =>
          (await client.execute({ sql, args })).rows as T
      } as unknown as PrismaService;

      const summary = await querySummary(prisma, 'day', '2026-07-03', '2026-07-03');
      expect(summary).toMatchObject({
        totalGmv: 210,
        totalRefund: 20,
        refundRate: 0.5,
        verifyRate: 0.5,
        paidOrderCount: 2
      });

      const trend = await queryTrendRows(prisma, 'week', '2026-07-03', '2026-07-03');
      expect(trend).toHaveLength(1);
      expect(trend[0]).toMatchObject({ totalGmv: 210, totalRefund: 20 });

      const exportRows = await loadMerchantSalesExportRows(
        prisma,
        'day',
        '2026-07-03',
        '2026-07-03',
        sortColumn('gmvDesc')
      );
      expect(exportRows.map((row) => [row.merchantName, row.gmv])).toEqual([
        ['merchant-a', 130],
        ['merchant-b', 80]
      ]);

      const exported = await queryExportCsv(prisma, 'day', '2026-07-03', '2026-07-03', 'gmvDesc');
      expect(exported.csv).toContain(
        'merchant-a,area-a,130.00,20.00,10.00,1.0000,1.0000,1,1,1,day,2026-07-03,2026-07-03'
      );
    } finally {
      await client.close();
    }
  });
});
