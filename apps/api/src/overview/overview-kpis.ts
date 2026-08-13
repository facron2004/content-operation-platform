import type { PrismaService } from '../prisma/prisma.service';
import { beijingDateKey } from '@content/shared';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import { TtlCache, withHeavyAggregateGate } from '../common';
import { DATA_ANALYSIS_OH_CONCURRENCY, mapPool } from '../common/sql-chunk';
import { resolveDayGmvMoney } from '../money';
import type { OverviewKpiPayload } from './overview.types';
import { aggregateStaleSkuStats } from './overview-stale';

export function buildOverviewKpiPayload(args: {
  today: string;
  totalMerchants: number;
  totalSkus: number;
  todayGmvFen: bigint | null;
  todayOrderCount: number;
  staleSkuRows: { stale30SkuCount: number; distinctMerchants: number };
  moneyUpdatedAt: string | null;
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
    todayGmvFen: args.todayGmvFen,
    todayOrderCount: args.todayOrderCount,
    updatedAt: args.moneyUpdatedAt,
    dataSource: args.moneyDataSource
  };
}

export async function countDistinctMerchants(prisma: PrismaService): Promise<number> {
  const [row] = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "merchantId") AS "c" FROM "ContentPackage" WHERE "merchantId" IS NOT NULL AND "merchantId" <> ''`
  )) as Array<{ c: number | null }>;
  return Number(row?.c ?? 0);
}

type KpiLegResult =
  | { kind: 'merchants'; v: number }
  | { kind: 'skus'; v: number }
  | { kind: 'money'; v: Awaited<ReturnType<typeof resolveDayGmvMoney>> }
  | { kind: 'stale'; v: Awaited<ReturnType<typeof aggregateStaleSkuStats>> };

export function loadOverviewKpis(
  prisma: PrismaService,
  cache: TtlCache,
  date?: string,
  /** When true, cold compute shares process-wide heavy aggregate pool. */
  useHeavyGate = false,
  force = false
) {
  return cache.getOrLoad(`kpis:${date ?? 'today'}`, force, () => {
    const load = async () => {
      const today = date ?? beijingDateKey(new Date());
      const rules = DEFAULT_INVENTORY_RULES;
      // Cap concurrent catalog COUNTs inside the heavy-gate slot. Bare 4-way
      // Promise.all still storms SQLite under multi-tab cold even with gate
      // (gate serializes holders, not nested queries). mapPool(2) matches
      // data-analysis OH matrix concurrency.
      const legs: Array<() => Promise<KpiLegResult>> = [
        async () => ({ kind: 'merchants', v: await countDistinctMerchants(prisma) }),
        async () => ({
          kind: 'skus',
          v: await prisma.contentPackage.count({ where: { stockLeft: { gt: 0 } } })
        }),
        async () => ({ kind: 'money', v: await resolveDayGmvMoney(prisma, today) }),
        async () => ({
          kind: 'stale',
          v: await aggregateStaleSkuStats(prisma, today, rules, force)
        })
      ];
      const results = await mapPool(legs, DATA_ANALYSIS_OH_CONCURRENCY, (fn) => fn());
      const totalMerchants = results.find((r) => r.kind === 'merchants')!.v;
      const totalSkus = results.find((r) => r.kind === 'skus')!.v;
      const money = results.find((r) => r.kind === 'money')!.v;
      const staleSkuRows = results.find((r) => r.kind === 'stale')!.v;
      return buildOverviewKpiPayload({
        today,
        totalMerchants,
        totalSkus,
        todayGmvFen: money.totalGmvFen,
        todayOrderCount: money.paidOrderCount,
        staleSkuRows,
        moneyUpdatedAt: money.updatedAt,
        moneyDataSource: money.dataSource
      });
    };
    return useHeavyGate ? withHeavyAggregateGate(load) : load();
  });
}
