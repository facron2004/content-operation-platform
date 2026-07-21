import { beijingDateKey, shiftDateKey } from '@content/shared';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import type { PrismaService } from '../prisma/prisma.service';

export function emptyMerchantProfile(merchantId: string) {
  return {
    merchantId,
    merchantName: merchantId,
    areaId: null,
    areaName: null,
    totalSku: 0,
    stale30SkuCount: 0,
    stale30Ratio: 0,
    avgScore: 0,
    activeAlertCount: 0
  };
}

export async function loadMerchantProfileBase(prisma: PrismaService, merchantId: string) {
  const [m] = (await prisma.$queryRawUnsafe(
    `SELECT "merchantId", MIN("merchantName") AS "merchantName", MIN("areaId") AS "areaId", MIN("areaName") AS "areaName", COUNT(*) AS "totalSku" FROM "ContentPackage" WHERE "merchantId" = ?`,
    merchantId
  )) as Array<{
    merchantId: string;
    merchantName: string;
    areaId: string | null;
    areaName: string | null;
    totalSku: number;
  }>;
  return m ?? null;
}

export async function countStale30ForMerchant(
  prisma: PrismaService,
  merchantId: string,
  staleThreshold: string
): Promise<number> {
  const [staleRow] = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS "stale30SkuCount" FROM "ContentPackage" WHERE "merchantId" = ? AND "stockLeft" > 0 AND NOT EXISTS ( SELECT 1 FROM "PackageSalesDaily" s WHERE s."packageId" = "ContentPackage"."packageId" AND s."salesQty" > 0 AND s."date" >= ? )`,
    merchantId,
    staleThreshold
  )) as Array<{ stale30SkuCount: number | bigint }>;
  return Number(staleRow?.stale30SkuCount ?? 0);
}

export async function buildMerchantProfile(prisma: PrismaService, merchantId: string) {
  const m = await loadMerchantProfileBase(prisma, merchantId);
  if (!m) return emptyMerchantProfile(merchantId);
  const today = beijingDateKey(new Date());
  const staleThreshold = shiftDateKey(today, -(DEFAULT_INVENTORY_RULES.stale30Days - 1));
  const stale30SkuCount = await countStale30ForMerchant(prisma, merchantId, staleThreshold);
  return {
    merchantId: m.merchantId,
    merchantName: m.merchantName,
    areaId: m.areaId,
    areaName: m.areaName,
    totalSku: Number(m.totalSku),
    stale30SkuCount,
    stale30Ratio: Number(m.totalSku) > 0 ? stale30SkuCount / Number(m.totalSku) : 0
  };
}
