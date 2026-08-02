import { beijingDateKey, shiftDateKey } from '@content/shared';
import { MERCHANT_SKU_LIST_LIMIT } from '../common/sql-chunk';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import type { PrismaService } from '../prisma/prisma.service';

export type MerchantSkuSqlRow = {
  packageId: string;
  packageName: string;
  areaName: string;
  category: string;
  salePriceFen: bigint | null;
  stockLeft: number;
  lastSalesDate: string | null;
  daysSinceLastSale: number | null;
};

export function staleBucketFromDays(days: number): string {
  const rules = DEFAULT_INVENTORY_RULES;
  if (days >= rules.stale60Days) return 'stale_60d';
  if (days >= rules.stale30Days) return 'stale_30d';
  if (days >= rules.stale15Days) return 'stale_15d';
  if (days >= rules.stale7Days) return 'stale_7d';
  return 'normal';
}

export async function queryMerchantSkuRows(
  prisma: PrismaService,
  today: string,
  threshold: string,
  merchantId: string
): Promise<MerchantSkuSqlRow[]> {
  // Cap SKUs per merchant — unbounded GROUP BY can balloon on large catalogs.
  return (await prisma.$queryRawUnsafe(
    `SELECT cp."packageId", cp."packageName", cp."areaName", cp."category", cp."salePriceFen", cp."stockLeft", MAX(sd."date") AS "lastSalesDate", CAST(julianday(?) - julianday(MAX(sd."date")) AS INTEGER) AS "daysSinceLastSale" FROM "ContentPackage" cp LEFT JOIN "PackageSalesDaily" sd ON sd."packageId" = cp."packageId" AND sd."salesQty" > 0 AND sd."date" >= ? WHERE cp."merchantId" = ? GROUP BY cp."packageId" ORDER BY "daysSinceLastSale" IS NULL DESC, "daysSinceLastSale" DESC LIMIT ?`,
    today,
    threshold,
    merchantId,
    MERCHANT_SKU_LIST_LIMIT
  )) as MerchantSkuSqlRow[];
}

export async function loadMerchantSkuRows(
  prisma: PrismaService,
  merchantId: string,
  // Residual #246: honor SPA day window (was hard-coded stale60Days).
  days = DEFAULT_INVENTORY_RULES.stale60Days
) {
  const today = beijingDateKey(new Date());
  const windowDays = Math.max(1, Math.floor(days));
  const threshold = shiftDateKey(today, -(windowDays - 1));
  return queryMerchantSkuRows(prisma, today, threshold, merchantId);
}

export function mapMerchantSkuRows(
  rows: Array<{
    packageId: string;
    packageName: string;
    areaName: string | null;
    category: string | null;
    salePriceFen: bigint | null;
    stockLeft: number | bigint;
    lastSalesDate: string | null;
    daysSinceLastSale: number | null;
  }>
) {
  return rows.map((r) => {
    const days = r.daysSinceLastSale ?? 9999;
    return {
      packageId: r.packageId,
      packageName: r.packageName,
      areaName: r.areaName,
      category: r.category,
      salePrice: Number(r.salePriceFen ?? 0) / 100,
      stockLeft: Number(r.stockLeft),
      lastSalesDate: r.lastSalesDate,
      daysSinceLastSale: days,
      staleBucket: staleBucketFromDays(days)
    };
  });
}
