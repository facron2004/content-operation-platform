/** Consolidated zero-sales module. */
import type { InventoryRuleConfig } from '../domain/rules-defaults';
import { PrismaService } from '../prisma/prisma.service';
import type { CandidateRow, MerchantAcc, StaleBucket } from './zero-sales.dto';

// --- zero-sales-bucket.ts ---
export function staleDaysFromBucket(bucket: StaleBucket, rules: InventoryRuleConfig): number {
  switch (bucket) {
    case 'stale_60d':
      return rules.stale60Days;
    case 'stale_30d':
      return rules.stale30Days;
    case 'stale_15d':
      return rules.stale15Days;
    case 'stale_7d':
      return rules.stale7Days;
    case 'normal':
      return 0;
  }
}
export function bucketFromDays(days: number, rules: InventoryRuleConfig): StaleBucket {
  if (days >= rules.stale60Days) return 'stale_60d';
  if (days >= rules.stale30Days) return 'stale_30d';
  if (days >= rules.stale15Days) return 'stale_15d';
  if (days >= rules.stale7Days) return 'stale_7d';
  return 'normal';
}

// --- zero-sales-candidates-load.ts ---
export async function loadStaleCandidates(
  prisma: PrismaService,
  q: { merchantId?: string; areaId?: string; search?: string },
  staleThreshold: string
): Promise<CandidateRow[]> {
  const candidates = (await prisma.contentPackage.findMany({
    where: {
      stockLeft: { gt: 0 },
      ...(q.merchantId ? { merchantId: q.merchantId } : {}),
      ...(q.areaId ? { areaId: q.areaId } : {}),
      ...(q.search ? { merchantName: { contains: q.search } } : {})
    },
    select: { packageId: true, merchantId: true, merchantName: true, areaName: true, areaId: true }
  })) as CandidateRow[];
  const ids = candidates.map((c) => c.packageId);
  if (!ids.length) return candidates;
  const recent = (await prisma.$queryRawUnsafe(
    `SELECT "packageId" FROM "PackageSalesDaily" WHERE "packageId" IN (${ids.map(() => '?').join(',')}) AND "date" >= ? AND "salesQty" > 0`,
    ...ids,
    staleThreshold
  )) as Array<{ packageId: string }>;
  return candidates.filter((c) => !new Set(recent.map((r) => r.packageId)).has(c.packageId));
}

// --- zero-sales-candidates-group.ts ---
export function groupCandidatesByMerchant(candidates: CandidateRow[]): Map<string, MerchantAcc> {
  const byMerchant = new Map<string, MerchantAcc>();
  for (const r of candidates) {
    const m = byMerchant.get(r.merchantId);
    if (m) m.packageIds.push(r.packageId);
    else
      byMerchant.set(r.merchantId, {
        merchantId: r.merchantId,
        merchantName: r.merchantName,
        areaName: r.areaName ?? '',
        areaId: r.areaId ?? '',
        packageIds: [r.packageId]
      });
  }
  return byMerchant;
}
