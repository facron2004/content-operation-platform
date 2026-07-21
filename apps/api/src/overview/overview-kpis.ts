import type { PrismaService } from '../prisma/prisma.service';
import { beijingDateKey } from '@content/shared';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import { TtlCache } from '../common';
import { resolveDayGmvMoney } from '../money';
import type { OverviewKpiPayload } from './overview.types';
import { aggregateStaleSkuStats } from './overview-stale';

export function buildOverviewKpiPayload(args: {
  today: string;
  totalMerchants: number;
  totalSkus: number;
  todayGmv: number;
  todayOrderCount: number;
  staleSkuRows: { stale30SkuCount: number; distinctMerchants: number };
  moneyDataSource: OverviewKpiPayload['dataSource'];
}): OverviewKpiPayload {
  const zeroSalesSkuCount = args.staleSkuRows.stale30SkuCount;
  const zeroSalesRatio =
    args.totalSkus > 0 ? Math.round((zeroSalesSkuCount / args.totalSkus) * 10000) / 10000 : 0;
  return {
    date: args.today,
    totalMerchants: args.totalMerchants,
    totalSkus: args.totalSkus,
    zeroSalesMerchants: args.staleSkuRows.distinctMerchants,
    zeroSalesSkuCount,
    zeroSalesSkuRatio: zeroSalesRatio,
    todayGmv: args.todayGmv,
    todayOrderCount: args.todayOrderCount,
    updatedAt: new Date().toISOString(),
    dataSource: args.moneyDataSource
  };
}

export async function countDistinctMerchants(prisma: PrismaService): Promise<number> {
  const [row] = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "merchantId") AS "c" FROM "ContentPackage" WHERE "merchantId" IS NOT NULL AND "merchantId" <> ''`
  )) as Array<{ c: number | null }>;
  return Number(row?.c ?? 0);
}

export function loadOverviewKpis(prisma: PrismaService, cache: TtlCache, date?: string) {
  return cache.getOrLoad(`kpis:${date ?? 'today'}`, false, async () => {
    const today = date ?? beijingDateKey(new Date());
    const rules = DEFAULT_INVENTORY_RULES;
    const [totalMerchants, totalSkus, money, staleSkuRows] = await Promise.all([
      countDistinctMerchants(prisma),
      prisma.contentPackage.count({ where: { stockLeft: { gt: 0 } } }),
      resolveDayGmvMoney(prisma, today),
      aggregateStaleSkuStats(prisma, today, rules)
    ]);
    return buildOverviewKpiPayload({
      today,
      totalMerchants,
      totalSkus,
      todayGmv: money.totalGmv,
      todayOrderCount: money.paidOrderCount,
      staleSkuRows,
      moneyDataSource: money.dataSource
    });
  });
}
