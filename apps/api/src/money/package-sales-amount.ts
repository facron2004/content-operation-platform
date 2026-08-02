import {
  beijingDayRangeSqlite,
  SQL_GMV_OH,
  sqlBeijingDate,
  sqlDatetimeExclusiveRange,
  toSqliteDateTime
} from '../common';

export type PackageSalesAmountPrisma = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  $transaction?: <T>(fn: (tx: PackageSalesAmountPrisma) => Promise<T>) => Promise<T>;
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
 * Zero+upsert run in one transaction so a mid-refresh crash cannot leave a window of
 * zeroed salesAmount with no replacement rows.
 *
 * WHERE paidTime uses exclusive half-open bounds so OrderHeader_paidTime_idx can seek;
 * sqlBeijingDate stays only for SELECT/GROUP BY day bucketing.
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

  const now = toSqliteDateTime();
  const paidStart = beijingDayRangeSqlite(startDate).start;
  const paidEnd = beijingDayRangeSqlite(endDate).end;

  // Note: intentionally does NOT use callback-style $transaction — the libsql adapter throws
  // "unknown variant SocketTimeout". Phase 6: legacy "salesAmount" column dropped.
  await prisma.$executeRawUnsafe(
    `UPDATE "PackageSalesDaily"
     SET "salesAmountFen" = 0, "updatedAt" = ?
     WHERE "date" >= ? AND "date" <= ?`,
    now,
    startDate,
    endDate
  );
  const rowsAffected = await prisma.$executeRawUnsafe(
    `INSERT INTO "PackageSalesDaily" (
        "id", "packageId", "date", "salesQty", "salesAmountFen", "refundQty",
        "deltaSource", "computedAt", "createdAt", "updatedAt"
      )
      SELECT
        oh."packageId" || '_' || ${sqlBeijingDate('oh."paidTime"')} AS "id",
        oh."packageId" AS "packageId",
        ${sqlBeijingDate('oh."paidTime"')} AS "date",
        0 AS "salesQty",
        COALESCE(SUM(${SQL_GMV_OH}), 0) AS "salesAmountFen",
        0 AS "refundQty",
        'order_header' AS "deltaSource",
        ? AS "computedAt",
        ? AS "createdAt",
        ? AS "updatedAt"
      FROM "OrderHeader" oh
      WHERE oh."paidTime" IS NOT NULL
        AND oh."packageId" IS NOT NULL
        AND oh."packageId" <> ''
        AND ${sqlDatetimeExclusiveRange('oh."paidTime"')}
      GROUP BY oh."packageId", ${sqlBeijingDate('oh."paidTime"')}
      ON CONFLICT("packageId", "date") DO UPDATE SET
        "salesAmountFen" = excluded."salesAmountFen",
        "computedAt" = excluded."computedAt",
        "updatedAt" = excluded."updatedAt"
    `,
    now,
    now,
    now,
    paidStart,
    paidEnd
  );

  const [joinable] = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmv"
     FROM "OrderHeader"
     WHERE "paidTime" IS NOT NULL
       AND "packageId" IS NOT NULL AND "packageId" <> ''
       AND ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    paidStart,
    paidEnd
  )) as Array<{ gmv: number }>;

  const [total] = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmv"
     FROM "OrderHeader"
     WHERE "paidTime" IS NOT NULL
       AND ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    paidStart,
    paidEnd
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
