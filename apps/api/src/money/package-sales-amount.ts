import { SQL_GMV_OH } from '../common';

export type PackageSalesAmountPrisma = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
};

export type PackageSalesAmountResult = {
  startDate: string;
  endDate: string;
  rowsUpserted: number;
  joinableGmv: number;
  unjoinableGmv: number;
  coverageRatio: number;
};

/**
 * Fill PackageSalesDaily.salesAmount from OrderHeader by packageId + Beijing day.
 * Does not overwrite salesQty. Rows without packageId are excluded (reported as unjoinable).
 */
export async function recomputePackageSalesAmountRange(
  prisma: PackageSalesAmountPrisma,
  startDate: string,
  endDate: string
): Promise<PackageSalesAmountResult> {
  if (startDate > endDate) {
    throw new Error(
      `recomputePackageSalesAmountRange: startDate ${startDate} > endDate ${endDate}`
    );
  }

  // Ensure target rows exist for package/day pairs with OH sales (qty may already exist from inventory).
  const rowsAffected = await prisma.$executeRawUnsafe(
    `
      INSERT INTO "PackageSalesDaily" (
        "id", "packageId", "date", "salesQty", "salesAmount", "refundQty",
        "deltaSource", "computedAt", "createdAt", "updatedAt"
      )
      SELECT
        oh."packageId" || '_' || date(datetime(oh."paidTime", '+8 hours')) AS "id",
        oh."packageId" AS "packageId",
        date(datetime(oh."paidTime", '+8 hours')) AS "date",
        0 AS "salesQty",
        COALESCE(SUM(${SQL_GMV_OH}), 0) AS "salesAmount",
        0 AS "refundQty",
        'order_header' AS "deltaSource",
        CURRENT_TIMESTAMP AS "computedAt",
        CURRENT_TIMESTAMP AS "createdAt",
        CURRENT_TIMESTAMP AS "updatedAt"
      FROM "OrderHeader" oh
      WHERE oh."paidTime" IS NOT NULL
        AND oh."packageId" IS NOT NULL
        AND oh."packageId" <> ''
        AND date(datetime(oh."paidTime", '+8 hours')) >= ?
        AND date(datetime(oh."paidTime", '+8 hours')) <= ?
      GROUP BY oh."packageId", date(datetime(oh."paidTime", '+8 hours'))
      ON CONFLICT("packageId", "date") DO UPDATE SET
        "salesAmount" = excluded."salesAmount",
        "computedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    startDate,
    endDate
  );

  const [joinable] = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmv"
     FROM "OrderHeader"
     WHERE "paidTime" IS NOT NULL
       AND "packageId" IS NOT NULL AND "packageId" <> ''
       AND date(datetime("paidTime", '+8 hours')) >= ?
       AND date(datetime("paidTime", '+8 hours')) <= ?`,
    startDate,
    endDate
  )) as Array<{ gmv: number }>;

  const [total] = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmv"
     FROM "OrderHeader"
     WHERE "paidTime" IS NOT NULL
       AND date(datetime("paidTime", '+8 hours')) >= ?
       AND date(datetime("paidTime", '+8 hours')) <= ?`,
    startDate,
    endDate
  )) as Array<{ gmv: number }>;

  const joinableGmv = Number(joinable?.gmv ?? 0);
  const totalGmv = Number(total?.gmv ?? 0);
  const unjoinableGmv = Math.max(0, totalGmv - joinableGmv);

  return {
    startDate,
    endDate,
    rowsUpserted: Number(rowsAffected ?? 0),
    joinableGmv,
    unjoinableGmv,
    coverageRatio: totalGmv > 0 ? joinableGmv / totalGmv : 1
  };
}

/** Reconcile PSD.salesAmount vs OH joinable GMV for a day; true if within ¥1 or 0.1%. */
export function isSalesAmountReconciled(
  psdSum: number,
  ohJoinableGmv: number,
  absTol = 1,
  relTol = 0.001
): boolean {
  const delta = Math.abs(psdSum - ohJoinableGmv);
  if (delta <= absTol) return true;
  const base = Math.max(Math.abs(ohJoinableGmv), Math.abs(psdSum), 1);
  return delta / base <= relTol;
}
