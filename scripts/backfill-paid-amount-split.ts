import { PrismaClient } from '@prisma/client';
import { ensureDatabaseSchema } from '../prisma/seed-data';

/**
 * 中台数据层：SalesSnapshot 支付渠道拆分 backfill
 *
 * 一次性脚本,可重复运行（UPDATE 幂等）。
 * - paidAmountOnline = paidAmount   (历史全部视为在线支付)
 * - paidAmountWallet = 0           (余额/储值卡,JeSite 暂无拆分数据)
 * - paidAmountBonus  = 0           (积分抵现,JeSite 暂无拆分数据)
 * - paidAmountCard   = 0           (储值卡,与 Wallet 同口径预留)
 *
 * 执行方式: pnpm tsx scripts/backfill-paid-amount-split.ts
 */
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' }
  }
});

async function main() {
  await ensureDatabaseSchema(prisma);

  const before = await prisma.$queryRawUnsafe<Array<{ count: number; sum: number }>>(
    `SELECT COUNT(*) AS count, COALESCE(SUM("paidAmount"), 0) AS sum FROM "SalesSnapshot"`
  );

  // ON CONFLICT 在 SQLite 上对 UPDATE 用不到——直接 UPDATE 已存在行即可。
  // 拆分 4 列已 default 0,只需把 paidAmount 拷到 paidAmountOnline。
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE "SalesSnapshot"
     SET "paidAmountOnline" = "paidAmount"
     WHERE "paidAmount" > 0`
  );

  const after = await prisma.$queryRawUnsafe<
    Array<{ online: number; wallet: number; bonus: number; card: number }>
  >(
    `SELECT
        COALESCE(SUM("paidAmountOnline"), 0) AS online,
        COALESCE(SUM("paidAmountWallet"), 0) AS wallet,
        COALESCE(SUM("paidAmountBonus"), 0) AS bonus,
        COALESCE(SUM("paidAmountCard"), 0) AS card
     FROM "SalesSnapshot"`
  );

  console.log(
    JSON.stringify(
      {
        rowsWithPayment: Number(before[0]?.count ?? 0),
        paidAmountSum: Number(before[0]?.sum ?? 0),
        rowsUpdated: Number(updated),
        after: {
          paidAmountOnline: Number(after[0]?.online ?? 0),
          paidAmountWallet: Number(after[0]?.wallet ?? 0),
          paidAmountBonus: Number(after[0]?.bonus ?? 0),
          paidAmountCard: Number(after[0]?.card ?? 0)
        },
        note: 'paidAmountWallet/Bonus/Card 留 0,等 JeSite 字段接入后由 etl-orders 覆盖'
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
