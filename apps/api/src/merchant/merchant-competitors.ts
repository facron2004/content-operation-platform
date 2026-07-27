import type { PrismaService } from '../prisma/prisma.service';
import { MERCHANT_COMPETITORS_LIMIT } from '../common';

export type CompetitorSqlRow = {
  merchantId: string;
  merchantName: string;
  areaName: string;
  category: string;
  skuCount: number;
  totalPrice: number;
};

export type MerchantCompetitorItem = {
  merchantId: string;
  merchantName: string;
  areaName: string;
  category: string;
  skuCount: number;
  totalPrice: number;
};

export type MerchantCompetitorsPayload = {
  competitors: MerchantCompetitorItem[];
  /** Residual #285: MERCHANT_COMPETITORS_LIMIT (Top-N head). */
  limit: number;
  /**
   * Residual #285: rows matched before head clip.
   * When truncated, this is `limit + 1` (LIMIT+1 probe — at-least, not exact COUNT).
   */
  matched: number;
  truncated: boolean;
};

export async function queryCompetitorRows(
  prisma: PrismaService,
  merchantId: string,
  areaId: string,
  /** Fetch one extra so truncated can be exact without a separate COUNT. */
  fetchLimit: number = MERCHANT_COMPETITORS_LIMIT + 1
): Promise<CompetitorSqlRow[]> {
  return (await prisma.$queryRawUnsafe(
    `SELECT cp."merchantId", MIN(cp."merchantName") AS "merchantName", MIN(cp."areaName") AS "areaName", cp."category", COUNT(*) AS "skuCount", COALESCE(SUM(cp."salePrice"), 0) AS "totalPrice" FROM "ContentPackage" cp WHERE cp."merchantId" != ? AND cp."category" IN (SELECT DISTINCT "category" FROM "ContentPackage" WHERE "merchantId" = ?) AND cp."areaId" = ? GROUP BY cp."merchantId", cp."category" ORDER BY "skuCount" DESC LIMIT ?`,
    merchantId,
    merchantId,
    areaId,
    fetchLimit
  )) as CompetitorSqlRow[];
}

export async function loadCompetitors(
  prisma: PrismaService,
  merchantId: string
): Promise<MerchantCompetitorsPayload> {
  const limit = MERCHANT_COMPETITORS_LIMIT;
  const empty: MerchantCompetitorsPayload = {
    competitors: [],
    limit,
    matched: 0,
    truncated: false
  };
  const [self] = (await prisma.$queryRawUnsafe(
    `SELECT "merchantId", MIN("areaId") AS "areaId" FROM "ContentPackage" WHERE "merchantId" = ?`,
    merchantId
  )) as Array<{ merchantId: string; areaId: string | null }>;
  if (!self) return empty;

  // Residual #285: LIMIT+1 probe — exact truncated without COUNT(*), head stays Top-N.
  const rows = await queryCompetitorRows(prisma, merchantId, self.areaId ?? '', limit + 1);
  const truncated = rows.length > limit;
  const head = rows.slice(0, limit);
  const competitors = head.map((c) => ({
    merchantId: c.merchantId,
    merchantName: c.merchantName,
    areaName: c.areaName,
    category: c.category,
    skuCount: Number(c.skuCount),
    totalPrice: Number(c.totalPrice)
  }));
  return {
    competitors,
    limit,
    // When truncated, matched is at-least limit+1 (probe ceiling), not full COUNT.
    matched: truncated ? limit + 1 : competitors.length,
    truncated
  };
}
