import type { InventoryRuleConfig } from '../domain/rules-defaults';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import { computeStaleFlag } from '../domain/sales-daily';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { OverviewTopOffender } from './overview.types';

export async function aggregateStaleSkuStats(
  prisma: PrismaService,
  today: string,
  rules: InventoryRuleConfig
) {
  const threshold = shiftDateKey(today, -(rules.stale30Days - 1));
  const [row] = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS "stale30SkuCount", COUNT(DISTINCT "merchantId") AS "distinctMerchants" FROM "ContentPackage" WHERE "stockLeft" > 0 AND NOT EXISTS ( SELECT 1 FROM "PackageSalesDaily" s WHERE s."packageId" = "ContentPackage"."packageId" AND s."salesQty" > 0 AND s."date" >= ?)`,
    threshold
  )) as Array<{ stale30SkuCount: number; distinctMerchants: number }>;
  return {
    stale30SkuCount: Number(row?.stale30SkuCount ?? 0),
    distinctMerchants: Number(row?.distinctMerchants ?? 0)
  };
}

export async function loadStalePackageRows(prisma: PrismaService, threshold: string) {
  return (await prisma.$queryRawUnsafe(
    `SELECT cp."packageId", cp."stockLeft", MAX(s."date") AS "lastSalesDate" FROM "ContentPackage" cp LEFT JOIN "PackageSalesDaily" s ON s."packageId" = cp."packageId" AND s."salesQty" > 0 AND s."date" >= ? WHERE cp."stockLeft" > 0 GROUP BY cp."packageId", cp."stockLeft"`,
    threshold
  )) as Array<{ packageId: string; stockLeft: number; lastSalesDate: string | null }>;
}

export async function aggregateStaleBucketStats(
  prisma: PrismaService
): Promise<Record<string, number>> {
  const today = beijingDateKey(new Date());
  const rules = DEFAULT_INVENTORY_RULES;
  const threshold = shiftDateKey(today, -(rules.stale60Days - 1));
  const rows = await loadStalePackageRows(prisma, threshold);
  const stats: Record<string, number> = {
    normal: 0,
    stale_7d: 0,
    stale_15d: 0,
    stale_30d: 0,
    stale_60d: 0
  };
  for (const r of rows) {
    const bucket = computeStaleFlag({
      lastSalesDate: r.lastSalesDate,
      currentStockLeft: r.stockLeft,
      todayKey: today,
      rules
    });
    stats[bucket] += 1;
  }
  return stats;
}

export type StaleMerchantOffenderRow = {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  stale30SkuCount: number;
  totalSku: number | null;
};

export async function queryStaleMerchantOffenders(
  prisma: PrismaService,
  threshold: string,
  limit: number
): Promise<StaleMerchantOffenderRow[]> {
  return (await prisma.$queryRawUnsafe(
    `SELECT cp."merchantId", MIN(cp."merchantName") AS "merchantName", MIN(cp."areaName") AS "areaName", COUNT(DISTINCT cp."packageId") AS "stale30SkuCount", (SELECT COUNT(*) FROM "ContentPackage" cp2 WHERE cp2."merchantId" = cp."merchantId") AS "totalSku" FROM "ContentPackage" cp WHERE cp."stockLeft" > 0 AND NOT EXISTS (SELECT 1 FROM "PackageSalesDaily" s WHERE s."packageId" = cp."packageId" AND s."salesQty" > 0 AND s."date" >= ?) GROUP BY cp."merchantId" ORDER BY "stale30SkuCount" DESC LIMIT ?`,
    threshold,
    limit
  )) as StaleMerchantOffenderRow[];
}

export async function loadTopOffenders(
  prisma: PrismaService,
  limit: number
): Promise<OverviewTopOffender[]> {
  const today = beijingDateKey(new Date());
  const threshold = shiftDateKey(today, -(DEFAULT_INVENTORY_RULES.stale30Days - 1));
  const rows = await queryStaleMerchantOffenders(prisma, threshold, limit);
  return rows.map((r) => ({
    merchantId: r.merchantId,
    merchantName: r.merchantName,
    areaName: r.areaName,
    stale30SkuCount: Number(r.stale30SkuCount),
    totalSku: Number(r.totalSku ?? 0)
  }));
}
