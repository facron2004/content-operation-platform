/** Consolidated zero-sales module. */
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ZeroSalesSkuRow } from './zero-sales.dto';

// --- zero-sales-package-sales-loaders.ts ---
export async function loadGmvByPackage(
  prisma: PrismaService,
  packageIds: string[],
  fromDate: string
): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (!packageIds.length) return m;
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "packageId", COALESCE(SUM("salesAmount"), 0) AS "gmv30d" FROM "PackageSalesDaily" WHERE "packageId" IN (${packageIds.map(() => '?').join(',')}) AND "date" >= ? AND "salesQty" > 0 GROUP BY "packageId"`,
    ...packageIds,
    fromDate
  )) as Array<{ packageId: string; gmv30d: number }>;
  for (const g of rows) m.set(g.packageId, Number(g.gmv30d));
  return m;
}
export async function loadLastSalesByPackage(
  prisma: PrismaService,
  packageIds: string[]
): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!packageIds.length) return m;
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT s."packageId", MAX(s."date") AS "lastSalesDate" FROM "PackageSalesDaily" s WHERE s."packageId" IN (${packageIds.map(() => '?').join(',')}) AND s."salesQty" > 0 GROUP BY s."packageId"`,
    ...packageIds
  )) as Array<{ packageId: string; lastSalesDate: string }>;
  for (const r of rows) m.set(r.packageId, r.lastSalesDate);
  return m;
}

// --- zero-sales-package-loaders.ts ---
export async function loadTotalSkuByMerchant(
  prisma: PrismaService,
  merchantIds: string[]
): Promise<Map<string, number>> {
  if (!merchantIds.length) return new Map();
  const skuRows = (await prisma.$queryRawUnsafe(
    `SELECT "merchantId", COUNT(*) AS "c" FROM "ContentPackage" WHERE "merchantId" IN (${merchantIds.map(() => '?').join(',')}) GROUP BY "merchantId"`,
    ...merchantIds
  )) as Array<{ merchantId: string; c: number }>;
  return new Map(skuRows.map((r) => [r.merchantId, Number(r.c)]));
}

// --- zero-sales-sku-filters.ts ---
export function buildZeroSalesSkuFilters(args: {
  merchantId?: string;
  category?: string;
  areaId?: string;
  search?: string;
  threshold: string;
}): { filters: string[]; params: string[] } {
  const params: string[] = [],
    filters: string[] = ['cp."stockLeft" > 0'];
  if (args.merchantId) {
    filters.push('cp."merchantId" = ?');
    params.push(args.merchantId);
  }
  if (args.category) {
    filters.push('cp."category" = ?');
    params.push(args.category);
  }
  if (args.areaId) {
    filters.push('cp."areaId" = ?');
    params.push(args.areaId);
  }
  if (args.search) {
    filters.push('(cp."packageName" LIKE ? OR cp."merchantName" LIKE ?)');
    params.push(`%${args.search}%`, `%${args.search}%`);
  }
  filters.push(
    `NOT EXISTS (SELECT 1 FROM "PackageSalesDaily" s WHERE s."packageId" = cp."packageId" AND s."salesQty" > 0 AND s."date" >= ?)`
  );
  params.push(args.threshold);
  return { filters, params };
}
export function zeroSalesSkuOrderBy(sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc'): string {
  if (sort === 'lastSalesDateAsc') return '"lastSalesDate" ASC NULLS FIRST, cp."packageId" ASC';
  if (sort === 'staleDesc') return '"daysSinceLastSale" DESC NULLS FIRST, cp."packageId" ASC';
  return '"staleGmv30d" DESC, cp."packageId" ASC';
}

// --- zero-sales-sku-sql.ts ---
export function buildZeroSalesSkuSelectSql(filtersSql: string, orderBy: string): string {
  return `
WITH last_sale AS (
  SELECT "packageId", MAX("date") AS "lastSalesDate"
  FROM "PackageSalesDaily"
  WHERE "salesQty" > 0
  GROUP BY "packageId"
),
sales_30d AS (
  SELECT
    "packageId",
    COALESCE(SUM("salesQty"), 0) AS "salesQty30d",
    COALESCE(SUM("salesAmount"), 0) AS "gmv30d"
  FROM "PackageSalesDaily"
  WHERE "date" >= ?
    AND "salesQty" > 0
  GROUP BY "packageId"
)
SELECT
  cp."packageId",
  cp."packageName",
  cp."merchantId",
  cp."merchantName",
  cp."areaName",
  cp."category",
  cp."salePrice",
  cp."stockLeft",
  cp."stockTotal",
  ls."lastSalesDate",
  CAST(julianday(?) - julianday(ls."lastSalesDate") AS INTEGER) AS "daysSinceLastSale",
  COALESCE(s30."gmv30d", 0) AS "staleGmv30d",
  COALESCE(s30."salesQty30d", 0) AS "staleSalesQty30d"
FROM "ContentPackage" cp
LEFT JOIN last_sale ls ON ls."packageId" = cp."packageId"
LEFT JOIN sales_30d s30 ON s30."packageId" = cp."packageId"
WHERE ${filtersSql}
ORDER BY ${orderBy}
LIMIT ? OFFSET ?
`;
}

// --- zero-sales-sku-query.ts ---
export async function queryZeroSalesSkuRows(
  prisma: PrismaService,
  args: {
    today: string;
    start30d: string;
    threshold: string;
    merchantId?: string;
    category?: string;
    areaId?: string;
    search?: string;
    sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
    page: number;
    pageSize: number;
  }
): Promise<ZeroSalesSkuRow[]> {
  const { filters, params: filterParams } = buildZeroSalesSkuFilters(args);
  const params: Array<string> = [args.start30d, ...filterParams],
    orderBy = zeroSalesSkuOrderBy(args.sort);
  const offset = (args.page - 1) * args.pageSize;
  params.push(args.today, String(args.pageSize), String(offset));
  return (await prisma.$queryRawUnsafe(
    buildZeroSalesSkuSelectSql(filters.join(' AND '), orderBy),
    ...params
  )) as ZeroSalesSkuRow[];
}

// --- zero-sales-sku-timeline-series.ts ---
export async function loadSkuTimelineSeries(
  prisma: PrismaService,
  packageId: string,
  start: string,
  today: string,
  days: number
) {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "snapshotDate" AS "date", "remainingStock" AS "stockLeft" FROM "JeeSiteInventoryDailySnapshot" WHERE "packageId" = ? AND "snapshotDate" >= ? AND "snapshotDate" <= ? ORDER BY "snapshotDate" ASC`,
    packageId,
    start,
    today
  )) as Array<{ date: string; stockLeft: number }>;
  const sales = (await prisma.$queryRawUnsafe(
    `SELECT "date", "salesQty", COALESCE("deltaSource", 'legacy') AS "deltaSource" FROM "PackageSalesDaily" WHERE "packageId" = ? AND "date" >= ? AND "date" <= ? ORDER BY "date" ASC`,
    packageId,
    start,
    today
  )) as Array<{ date: string; salesQty: number; deltaSource: string }>;
  const salesByDate = new Map(sales.map((s) => [s.date, s])),
    stockByDate = new Map(rows.map((r) => [r.date, r.stockLeft]));
  const timeline: Array<{
    date: string;
    stockLeft: number;
    salesQty: number;
    deltaSource: string;
  }> = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(start, i),
      s = salesByDate.get(d);
    timeline.push({
      date: d,
      stockLeft: Number(stockByDate.get(d) ?? 0),
      salesQty: Number(s?.salesQty ?? 0),
      deltaSource: s?.deltaSource ?? 'no_data'
    });
  }
  return timeline;
}

// --- zero-sales-sku-timeline.ts ---
export async function loadSkuTimeline(prisma: PrismaService, packageId: string, days: number) {
  const today = beijingDateKey(new Date());
  const start = shiftDateKey(today, -(days - 1));
  const timeline = await loadSkuTimelineSeries(prisma, packageId, start, today, days);
  return { packageId, days, timeline };
}
