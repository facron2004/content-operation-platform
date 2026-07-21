import { beijingDateKey, shiftDateKey } from '@content/shared';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import type { PrismaService } from '../prisma/prisma.service';
import type { MerchantsListQueryDto } from './merchant.dto';

export type MerchantListItem = {
  merchantId: string;
  merchantName: string;
  areaId: string | null;
  areaName: string | null;
  totalSku: number;
  stale30SkuCount: number;
  stale30Ratio: number;
  totalGmv30d: number;
};

export type MerchantRow = {
  merchantId: string;
  merchantName: string;
  areaId: string | null;
  areaName: string | null;
  totalSku: number;
};

export async function listMerchantRows(
  prisma: PrismaService,
  q: { areaId?: string; search?: string }
): Promise<MerchantRow[]> {
  const filters = [`"merchantId" IS NOT NULL`, `"merchantId" <> ''`];
  const params: string[] = [];
  if (q.areaId) {
    filters.push(`"areaId" = ?`);
    params.push(q.areaId);
  }
  if (q.search) {
    filters.push(`"merchantName" LIKE ?`);
    params.push(`%${q.search}%`);
  }
  return (await prisma.$queryRawUnsafe(
    `SELECT "merchantId", MIN("merchantName") AS "merchantName", MIN("areaId") AS "areaId", MIN("areaName") AS "areaName", COUNT(*) AS "totalSku" FROM "ContentPackage" WHERE ${filters.join(' AND ')} GROUP BY "merchantId"`,
    ...params
  )) as MerchantRow[];
}

export async function loadPackagesForMerchants(
  prisma: PrismaService,
  merchantIds: string[]
): Promise<Array<{ packageId: string; merchantId: string }>> {
  if (!merchantIds.length) return [];
  return prisma.contentPackage.findMany({
    where: { merchantId: { in: merchantIds }, stockLeft: { gt: 0 } },
    select: { packageId: true, merchantId: true }
  });
}

export async function loadRecentSalesPackageIds(
  prisma: PrismaService,
  pkgIds: string[],
  fromDate: string
): Promise<Set<string>> {
  if (!pkgIds.length) return new Set();
  const ph = pkgIds.map(() => '?').join(',');
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "packageId" FROM "PackageSalesDaily" WHERE "packageId" IN (${ph}) AND "date" >= ? AND "salesQty" > 0`,
    ...pkgIds,
    fromDate
  )) as Array<{ packageId: string }>;
  return new Set(rows.map((r) => r.packageId));
}

export async function loadGmvByPackage(
  prisma: PrismaService,
  pkgIds: string[],
  fromDate: string
): Promise<Map<string, number>> {
  if (!pkgIds.length) return new Map();
  const ph = pkgIds.map(() => '?').join(',');
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "packageId", COALESCE(SUM("salesAmount"), 0) AS "gmv30d" FROM "PackageSalesDaily" WHERE "packageId" IN (${ph}) AND "date" >= ? AND "salesQty" > 0 GROUP BY "packageId"`,
    ...pkgIds,
    fromDate
  )) as Array<{ packageId: string; gmv30d: number }>;
  return new Map(rows.map((r) => [r.packageId, Number(r.gmv30d)]));
}

export async function collectMerchantMetricMaps(params: {
  prisma: PrismaService;
  merchantIds: string[];
  staleThreshold: string;
}) {
  const packages = await loadPackagesForMerchants(params.prisma, params.merchantIds);
  const pkgIds = packages.map((p) => p.packageId);
  const recentSet = await loadRecentSalesPackageIds(params.prisma, pkgIds, params.staleThreshold);
  const stale30PackageIds = new Set(pkgIds.filter((pid) => !recentSet.has(pid)));
  const stale30ByMerchant = new Map<string, number>();
  for (const pid of stale30PackageIds) {
    const merchantId = packages.find((p) => p.packageId === pid)?.merchantId;
    if (merchantId) stale30ByMerchant.set(merchantId, (stale30ByMerchant.get(merchantId) ?? 0) + 1);
  }
  const gmvByPackage = await loadGmvByPackage(params.prisma, pkgIds, params.staleThreshold);
  const gmvByMerchant = new Map<string, number>();
  for (const p of packages) {
    gmvByMerchant.set(
      p.merchantId,
      (gmvByMerchant.get(p.merchantId) ?? 0) + (gmvByPackage.get(p.packageId) ?? 0)
    );
  }
  return { stale30ByMerchant, gmvByMerchant };
}

export async function aggregateMerchantListMetrics(params: {
  prisma: PrismaService;
  merchants: Array<{
    merchantId: string;
    merchantName: string;
    areaId: string | null;
    areaName: string | null;
    totalSku: number | bigint;
  }>;
  staleThreshold: string;
}): Promise<MerchantListItem[]> {
  const { stale30ByMerchant, gmvByMerchant } = await collectMerchantMetricMaps({
    prisma: params.prisma,
    merchantIds: params.merchants.map((m) => m.merchantId),
    staleThreshold: params.staleThreshold
  });
  return params.merchants.map((m) => ({
    merchantId: m.merchantId,
    merchantName: m.merchantName,
    areaId: m.areaId,
    areaName: m.areaName,
    totalSku: Number(m.totalSku),
    stale30SkuCount: stale30ByMerchant.get(m.merchantId) ?? 0,
    stale30Ratio:
      Number(m.totalSku) > 0 ? (stale30ByMerchant.get(m.merchantId) ?? 0) / Number(m.totalSku) : 0,
    totalGmv30d: gmvByMerchant.get(m.merchantId) ?? 0
  }));
}

export async function buildMerchantListItems(params: {
  prisma: PrismaService;
  merchants: Array<{
    merchantId: string;
    merchantName: string;
    areaId: string | null;
    areaName: string | null;
    totalSku: number | bigint;
  }>;
  staleThreshold: string;
}): Promise<MerchantListItem[]> {
  return aggregateMerchantListMetrics(params);
}

export function sortMerchantItems(
  items: MerchantListItem[],
  sort: 'totalSkuDesc' | 'totalGmvDesc' | 'staleDesc' | string | undefined
): void {
  if (sort === 'totalSkuDesc') {
    items.sort((a, b) => b.totalSku - a.totalSku || a.merchantId.localeCompare(b.merchantId));
  } else if (sort === 'totalGmvDesc') {
    items.sort((a, b) => b.totalGmv30d - a.totalGmv30d || a.merchantId.localeCompare(b.merchantId));
  } else {
    items.sort(
      (a, b) => b.stale30SkuCount - a.stale30SkuCount || a.merchantId.localeCompare(b.merchantId)
    );
  }
}

export function paginateMerchantItems(items: MerchantListItem[], query: MerchantsListQueryDto) {
  const offset = (query.page - 1) * query.pageSize;
  return {
    items: items.slice(offset, offset + query.pageSize),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      hasMore: items.length > offset + query.pageSize,
      total: items.length
    }
  };
}

export async function listMerchantsWithStale(params: {
  prisma: PrismaService;
  query: MerchantsListQueryDto;
}) {
  const today = beijingDateKey(new Date());
  const rules = DEFAULT_INVENTORY_RULES;
  const staleThreshold = shiftDateKey(today, -(rules.stale30Days - 1));
  const merchants = await listMerchantRows(params.prisma, params.query);
  const items = await buildMerchantListItems({
    prisma: params.prisma,
    merchants,
    staleThreshold
  });
  sortMerchantItems(items, params.query.sort);
  return paginateMerchantItems(items, params.query);
}
