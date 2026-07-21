/** Consolidated zero-sales module. */
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import { PrismaService } from '../prisma/prisma.service';
import {
  bucketFromDays,
  groupCandidatesByMerchant,
  loadStaleCandidates,
  staleDaysFromBucket
} from './zero-sales-candidates';
import {
  loadGmvByPackage,
  loadLastSalesByPackage,
  loadTotalSkuByMerchant,
  queryZeroSalesSkuRows
} from './zero-sales-loaders';
import {
  type MerchantAcc,
  type ZeroSalesSkuRow,
  ZeroSalesMerchantsQueryDto,
  ZeroSalesSkusQueryDto
} from './zero-sales.dto';

// --- zero-sales-merchant-rows.ts ---
export function buildZeroSalesMerchantRows(o: {
  byMerchant: Map<string, MerchantAcc>;
  gmvByPackage: Map<string, number>;
  lastSalesByPackage: Map<string, string>;
  totalSkuByMerchant: Map<string, number>;
  today: string;
  offset: number;
  pageSize: number;
}) {
  const gmvByM = new Map<string, number>(),
    lastByM = new Map<string, string>();
  for (const m of o.byMerchant.values()) {
    let sum = 0,
      last: string | null = null;
    for (const pid of m.packageIds) {
      sum += o.gmvByPackage.get(pid) ?? 0;
      const pl = o.lastSalesByPackage.get(pid);
      if (pl && (!last || pl > last)) last = pl;
    }
    gmvByM.set(m.merchantId, sum);
    if (last) lastByM.set(m.merchantId, last);
  }
  return [...o.byMerchant.values()]
    .map((m) => ({
      merchantId: m.merchantId,
      merchantName: m.merchantName,
      areaName: m.areaName,
      areaId: m.areaId,
      totalSku: o.totalSkuByMerchant.get(m.merchantId) ?? 0,
      staleSkuCount: m.packageIds.length,
      staleGmv30d: gmvByM.get(m.merchantId) ?? 0,
      lastSalesDate: lastByM.get(m.merchantId) ?? null
    }))
    .sort((a, b) => b.staleSkuCount - a.staleSkuCount || a.merchantId.localeCompare(b.merchantId))
    .slice(o.offset, o.offset + o.pageSize);
}

// --- zero-sales-list-map.ts ---
export function mapZeroSalesSkuRows(
  rows: ZeroSalesSkuRow[],
  rules: typeof DEFAULT_INVENTORY_RULES
) {
  return rows.map((r) => {
    const d = r.daysSinceLastSale ?? 9999;
    return {
      packageId: r.packageId,
      packageName: r.packageName,
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      areaName: r.areaName,
      category: r.category,
      salePrice: Number(r.salePrice),
      stockLeft: Number(r.stockLeft),
      stockTotal: Number(r.stockTotal),
      lastSalesDate: r.lastSalesDate,
      daysSinceLastSale: d,
      staleBucket: bucketFromDays(d, rules),
      staleGmv30d: Number(r.staleGmv30d),
      staleSalesQty30d: Number(r.staleSalesQty30d)
    };
  });
}

// --- zero-sales-list-merchants.ts ---
export async function listZeroSalesMerchants(prisma: PrismaService, q: ZeroSalesMerchantsQueryDto) {
  const today = beijingDateKey(new Date()),
    days = staleDaysFromBucket(q.staleBucket, DEFAULT_INVENTORY_RULES);
  const staleThreshold = shiftDateKey(today, -(days - 1)),
    offset = (q.page - 1) * q.pageSize;
  const filteredCandidates = await loadStaleCandidates(prisma, q, staleThreshold);
  const byMerchant = groupCandidatesByMerchant(filteredCandidates);
  const filteredIds = filteredCandidates.map((c) => c.packageId);
  const [gmvByPackage, lastSalesByPackage, totalSkuByMerchant] = await Promise.all([
    loadGmvByPackage(prisma, filteredIds, staleThreshold),
    loadLastSalesByPackage(prisma, filteredIds),
    loadTotalSkuByMerchant(prisma, [...byMerchant.keys()])
  ]);
  const items = buildZeroSalesMerchantRows({
    byMerchant,
    gmvByPackage,
    lastSalesByPackage,
    totalSkuByMerchant,
    today,
    offset,
    pageSize: q.pageSize
  });
  return {
    items,
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      hasMore: offset + q.pageSize < byMerchant.size,
      total: byMerchant.size
    }
  };
}

// --- zero-sales-list-skus.ts ---
export async function listZeroSalesSkus(prisma: PrismaService, q: ZeroSalesSkusQueryDto) {
  const today = beijingDateKey(new Date()),
    rules = DEFAULT_INVENTORY_RULES;
  const days = q.staleBucket ? staleDaysFromBucket(q.staleBucket, rules) : rules.stale7Days,
    threshold = shiftDateKey(today, -(days - 1)),
    start30d = shiftDateKey(today, -29);
  const rows = await queryZeroSalesSkuRows(prisma, {
    today,
    start30d,
    threshold,
    merchantId: q.merchantId,
    category: q.category,
    areaId: q.areaId,
    search: q.search,
    sort: q.sort,
    page: q.page,
    pageSize: q.pageSize
  });
  const items = mapZeroSalesSkuRows(rows, rules);
  return {
    items,
    pagination: { page: q.page, pageSize: q.pageSize, hasMore: items.length === q.pageSize }
  };
}
