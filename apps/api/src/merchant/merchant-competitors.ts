import type { PrismaService } from '../prisma/prisma.service';

export type CompetitorSqlRow = {
  merchantId: string;
  merchantName: string;
  areaName: string;
  category: string;
  skuCount: number;
  totalPrice: number;
};

export async function queryCompetitorRows(
  prisma: PrismaService,
  merchantId: string,
  areaId: string
): Promise<CompetitorSqlRow[]> {
  return (await prisma.$queryRawUnsafe(
    `SELECT cp."merchantId", MIN(cp."merchantName") AS "merchantName", MIN(cp."areaName") AS "areaName", cp."category", COUNT(*) AS "skuCount", COALESCE(SUM(cp."salePrice"), 0) AS "totalPrice" FROM "ContentPackage" cp WHERE cp."merchantId" != ? AND cp."category" IN (SELECT DISTINCT "category" FROM "ContentPackage" WHERE "merchantId" = ?) AND cp."areaId" = ? GROUP BY cp."merchantId", cp."category" ORDER BY "skuCount" DESC LIMIT 5`,
    merchantId,
    merchantId,
    areaId
  )) as CompetitorSqlRow[];
}

export async function loadCompetitors(prisma: PrismaService, merchantId: string) {
  const [self] = (await prisma.$queryRawUnsafe(
    `SELECT "merchantId", MIN("areaId") AS "areaId" FROM "ContentPackage" WHERE "merchantId" = ?`,
    merchantId
  )) as Array<{ merchantId: string; areaId: string | null }>;
  if (!self) return [];
  const competitors = await queryCompetitorRows(prisma, merchantId, self.areaId ?? '');
  return competitors.map((c) => ({
    merchantId: c.merchantId,
    merchantName: c.merchantName,
    areaName: c.areaName,
    category: c.category,
    skuCount: Number(c.skuCount),
    totalPrice: Number(c.totalPrice)
  }));
}
