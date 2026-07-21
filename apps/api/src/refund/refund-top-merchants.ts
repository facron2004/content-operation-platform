/** Consolidated refund module. */
import { beijingDateKey, beijingDayRangeUtc } from '@content/shared';
import { rateAgainstGmv, SQL_GMV_OH } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import type { TopMerchantRow } from './refund.dto';

// --- refund-top-merchants-query.ts ---
export type RawTopMerchant = {
  merchantName: string;
  merchantId: string;
  gmv: number;
  refund: number;
  verify: number;
  paidOrderCount: number;
};
export async function fetchTopMerchantsRaw(prisma: PrismaService): Promise<RawTopMerchant[]> {
  const dayKey = beijingDateKey(new Date()),
    { end: dayEnd } = beijingDayRangeUtc(dayKey);
  const weekStart = beijingDayRangeUtc(beijingDateKey(Date.now() - 6 * 86400000)).start;
  return (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(NULLIF(oh."merchantName", ''), oh."merchantId") AS "merchantName", oh."merchantId", COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmv", COALESCE(SUM(CASE WHEN oh."refundTime" IS NOT NULL THEN oh."refundAmount" ELSE 0 END), 0) AS "refund", COALESCE(SUM(CASE WHEN oh."verifyTime" IS NOT NULL THEN oh."verifyAmount" ELSE 0 END), 0) AS "verify", COUNT(CASE WHEN oh."paidTime" IS NOT NULL THEN 1 END) AS "paidOrderCount" FROM "OrderHeader" oh WHERE oh."paidTime" >= ? AND oh."paidTime" < ? AND oh."merchantId" IS NOT NULL GROUP BY oh."merchantId"`,
    weekStart.toISOString(),
    dayEnd.toISOString()
  )) as RawTopMerchant[];
}
export function pageTopMerchants(items: TopMerchantRow[], page: number, pageSize: number) {
  const offset = (page - 1) * pageSize,
    paged = items.slice(offset, offset + pageSize);
  return { items: paged, hasMore: paged.length === pageSize };
}

// --- refund-top-merchants.ts ---
function mapTopMerchant(row: RawTopMerchant): TopMerchantRow {
  const gmv = Number(row.gmv),
    refund = Number(row.refund),
    verify = Number(row.verify);
  return {
    merchantId: row.merchantId,
    merchantName: row.merchantName,
    areaName: null,
    gmv,
    refund,
    verify,
    refundRate: rateAgainstGmv(refund, gmv),
    verifyRate: rateAgainstGmv(verify, gmv),
    paidOrderCount: Number(row.paidOrderCount)
  };
}
export async function queryTopMerchantsWindow(
  prisma: PrismaService,
  sortBy: 'refundDesc' | 'verifyDesc' | string,
  page: number,
  pageSize: number
): Promise<{ items: TopMerchantRow[]; hasMore: boolean }> {
  const allItems = (await fetchTopMerchantsRaw(prisma)).map(mapTopMerchant);
  allItems.sort((a, b) => (sortBy === 'verifyDesc' ? b.verify - a.verify : b.refund - a.refund));
  return pageTopMerchants(allItems, page, pageSize);
}
