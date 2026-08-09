import { createClient, type InValue } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { beijingDayRangeSqlite } from '../src/common';
import { queryOrderHeaderGmv, queryOrderHeaderTrendAgg } from '../src/gmv/gmv-order-header.query';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('GMV OrderHeader 核销额口径', () => {
  it('只汇总已核销订单的 verifyAmountFen', async () => {
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
          "verifyTime" TEXT
        )
      `);
      const insert = (args: InValue[]) =>
        client.execute({
          sql: `INSERT INTO "OrderHeader" (
            "paidTime", "paidAmountFen", "paidAmountWalletFen", "paidAmountBonusFen",
            "paidAmountCardFen", "verifyAmountFen", "refundAmountFen", "verifyTime"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args
        });
      await insert(['2026-07-03 01:00:00', 10000, 0, 0, 0, 5000, 0, '2026-07-03 02:00:00']);
      await insert(['2026-07-03 03:00:00', 5000, 0, 0, 0, 999, 0, null]);

      const prisma = {
        $queryRawUnsafe: async <T = unknown>(sql: string, ...args: InValue[]) =>
          (await client.execute({ sql, args })).rows as T
      } as unknown as PrismaService;
      const { start, end } = beijingDayRangeSqlite('2026-07-03');

      const [aggregate] = await queryOrderHeaderGmv(prisma, start, end);
      expect(Number(aggregate?.verifyAmountFen)).toBe(5000);
      expect(Number(aggregate?.verifyCount)).toBe(1);
      expect(Number(aggregate?.orderCount)).toBe(2);

      const [trend] = await queryOrderHeaderTrendAgg(prisma, start, end);
      expect(trend?.date).toBe('2026-07-03');
      expect(Number(trend?.verifyAmountFen)).toBe(5000);
      expect(Number(trend?.verifyCount)).toBe(1);
      expect(Number(trend?.orderCount)).toBe(2);
    } finally {
      await client.close();
    }
  });
});
