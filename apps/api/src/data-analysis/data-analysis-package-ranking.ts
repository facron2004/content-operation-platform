/** Package ranking projection: merge re-listed package ids into display-name ranks. */
import { sqlDatetimeExclusiveRange } from '../common';
import { type DataAnalysisPackageRankRow } from './data-analysis.dto';
import { type PrismaLike, n } from './data-analysis-query.shared';
import { paidTimeBounds } from './data-analysis-window';

/**
 * Human label for a package rank row.
 * Never surface raw numeric packageIds — those look like "default placeholders"
 * in the TOP 5 UI when ContentPackage is missing a row (common for fresh JeeSite SKUs).
 */
export function resolvePackageDisplayName(
  packageName: string | null | undefined,
  packageId: string | null | undefined,
  merchantName?: string | null
): string {
  const id = (packageId ?? '').trim();
  const name = (packageName ?? '').trim();
  // Accept a real title only when it is non-empty and not just the id / a bare snowflake.
  if (name && name !== id && !/^\d{12,}$/.test(name)) return name;
  const merchant = (merchantName ?? '').trim();
  if (merchant) return `${merchant} · 套餐未同步`;
  return '（未命名商品）';
}

type PackageIdAggRow = {
  packageId: string | null;
  packageName: string | null;
  merchantName: string | null;
  orderCount: number | null;
  salesAmount: number | null;
};

/**
 * Collapse per-packageId aggregates into per-display-name ranks.
 * JeeSite re-lists the same product under many packageIds; ranking by id
 * fills TOP 5 with duplicate titles. Operators expect one row per product name.
 */
export function mergePackageRankingByName(
  rows: PackageIdAggRow[],
  limit: number
): DataAnalysisPackageRankRow[] {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 5));
  type Acc = {
    packageId: string;
    packageName: string;
    salesAmount: number;
    orderCount: number;
    /** sales of the representative packageId (highest within the name group). */
    leadSales: number;
  };
  const byName = new Map<string, Acc>();

  for (const r of rows) {
    const packageId = r.packageId?.trim() || '';
    const salesAmount = n(r.salesAmount);
    const orderCount = n(r.orderCount);
    const packageName = resolvePackageDisplayName(r.packageName, packageId, r.merchantName);
    const prev = byName.get(packageName);
    if (!prev) {
      byName.set(packageName, {
        packageId,
        packageName,
        salesAmount,
        orderCount,
        leadSales: salesAmount
      });
      continue;
    }
    prev.salesAmount += salesAmount;
    prev.orderCount += orderCount;
    // Keep the packageId that contributes the most sales as the representative id.
    if (
      salesAmount > prev.leadSales ||
      (salesAmount === prev.leadSales && packageId < prev.packageId)
    ) {
      prev.packageId = packageId;
      prev.leadSales = salesAmount;
    }
  }

  return [...byName.values()]
    .sort(
      (a, b) =>
        b.salesAmount - a.salesAmount ||
        b.orderCount - a.orderCount ||
        a.packageName.localeCompare(b.packageName, 'zh')
    )
    .slice(0, safeLimit)
    .map((r, i) => ({
      rank: i + 1,
      packageId: r.packageId,
      packageName: r.packageName,
      // Money is yuan; keep 2dp after multi-id sum (avoids 0.1+0.2 float noise).
      salesAmount: Math.round(r.salesAmount * 100) / 100,
      orderCount: r.orderCount
    }));
}

export async function queryPackageRanking(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit = 5
): Promise<DataAnalysisPackageRankRow[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 5));
  // Fetch a wider packageId window so same-name SKUs can collapse into TOP N.
  // 40× covers heavy re-list churn (e.g. 19+ ids per 悦得闲 title) without full scan.
  const fetchLimit = Math.min(500, Math.max(safeLimit * 40, safeLimit));
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       COALESCE(NULLIF(TRIM(oh."packageId"), ''), '') AS "packageId",
       NULLIF(TRIM(cp."packageName"), '') AS "packageName",
       NULLIF(TRIM(MAX(oh."merchantName")), '') AS "merchantName",
       COUNT(*) AS "orderCount",
       COALESCE(SUM(oh."paidAmountFen") / 100.0, 0) AS "salesAmount"
     FROM "OrderHeader" oh
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = oh."packageId"
     WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')}
     GROUP BY oh."packageId", cp."packageName"
     ORDER BY "salesAmount" DESC, "orderCount" DESC
     LIMIT ?`,
    startBound,
    endBound,
    fetchLimit
  )) as PackageIdAggRow[];

  return mergePackageRankingByName(rows, safeLimit);
}
