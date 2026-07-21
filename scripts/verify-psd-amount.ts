import { PrismaClient } from '@prisma/client';
import {
  isSalesAmountReconciled,
  recomputePackageSalesAmountRange
} from '../apps/api/src/money/package-sales-amount';

const dbUrl = process.env.DATABASE_URL ?? `file:${process.cwd().replace(/\\/g, '/')}/prisma/dev.db`;
const p = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const start = process.argv[2] ?? '2026-07-05';
  const end = process.argv[3] ?? '2026-07-12';
  const r = await recomputePackageSalesAmountRange(p, start, end);
  const [psd] = (await p.$queryRawUnsafe(
    `SELECT COALESCE(SUM("salesAmount"), 0) AS s FROM "PackageSalesDaily" WHERE "date" >= ? AND "date" <= ?`,
    start,
    end
  )) as Array<{ s: number }>;
  const psdSum = Number(psd?.s ?? 0);
  console.log(
    JSON.stringify(
      {
        recompute: r,
        psdSum,
        reconciled: isSalesAmountReconciled(psdSum, r.joinableGmv)
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
