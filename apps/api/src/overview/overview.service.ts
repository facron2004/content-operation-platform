import { Inject, Injectable, Logger } from '@nestjs/common';
import type { InventoryRuleConfig } from '../domain/rules-defaults';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import { computeStaleFlag } from '../domain/sales-daily';
import { PrismaService } from '../prisma/prisma.service';
import { localDateKey } from '@content/shared';

/**
 * 中台数据层：Overview 看板的总览数据服务。
 * 全部走 Prisma $queryRaw 聚合 + 5 min 进程内缓存，避免 N+1。
 *
 * 不依赖 ContentService.getRecommendations（避免循环依赖与 HTTP 抓取阻塞）。
 * 数据源：Merchant / ContentPackage / PackageSalesDaily / SalesSnapshot。
 */

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class OverviewService {
  private readonly logger = new Logger(OverviewService.name);
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * OverviewView 顶卡 6 KPI。
   * - totalMerchants: Merchant.count
   * - totalSkus: ContentPackage 中 stockLeft > 0 的活跃 SKU 数
   * - zeroSalesMerchants: 有库存 且 lastSalesDate < today-stale30Days 的 distinct merchantId 数
   * - zeroSalesSkuRatio: stale_30d 的 SKU 数 / totalSkus
   * - todayGmv: SalesSnapshot 今日 paidAmount 汇总
   * - todayOrderCount: SalesSnapshot 今日 paidOrderCount 汇总
   */
  async getKpis(date?: string) {
    const cacheKey = `kpis:${date ?? 'today'}`;
    const cached = this.readCache<OverviewKpiPayload>(cacheKey);
    if (cached) return cached;

    const today = date ?? localDateKey(new Date());
    const rules = DEFAULT_INVENTORY_RULES;

    const [totalMerchants, totalSkus, todayGmvRows, todayOrderRows, staleSkuRows] =
      await Promise.all([
        this.countDistinctMerchants(),
        this.prisma.contentPackage.count({ where: { stockLeft: { gt: 0 } } }),
        this.aggregateTodayGmv(today),
        this.aggregateTodayOrderCount(today),
        this.aggregateStaleSkuStats(today, rules)
      ]);

    const zeroSalesMerchants = staleSkuRows.distinctMerchants;
    const zeroSalesSkuCount = staleSkuRows.stale30SkuCount;
    const zeroSalesRatio =
      totalSkus > 0 ? Math.round((zeroSalesSkuCount / totalSkus) * 10000) / 10000 : 0;

    const payload: OverviewKpiPayload = {
      date: today,
      totalMerchants,
      totalSkus,
      zeroSalesMerchants,
      zeroSalesSkuCount,
      zeroSalesSkuRatio: zeroSalesRatio,
      todayGmv: todayGmvRows.gmv,
      todayOrderCount: todayOrderRows.paidOrderCount,
      updatedAt: new Date().toISOString(),
      dataSource: 'Prisma aggregate + JeeSiteInventoryDailySnapshot'
    };
    this.writeCache(cacheKey, payload);
    return payload;
  }

  /**
   * 7/30 日动销趋势。
   * 返回 [{date, gmv, paidQty, staleCount}]，staleCount = 截至当日累计 stale_30d SKU 数。
   */
  async getTrend(days: number, endDate?: string) {
    const cacheKey = `trend:${days}:${endDate ?? 'today'}`;
    const cached = this.readCache<OverviewTrendPoint[]>(cacheKey);
    if (cached) return cached;

    const end = endDate ?? localDateKey(new Date());
    const startDate = this.shiftDate(end, -(days - 1));

    // SalesSnapshot 拉 daily GMV/Order
    const salesRows = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          substr("snapshotTime", 1, 10) AS "date",
          COALESCE(SUM("paidAmount"), 0)   AS "gmv",
          COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount"
        FROM "SalesSnapshot"
        WHERE substr("snapshotTime", 1, 10) >= ? AND substr("snapshotTime", 1, 10) <= ?
        GROUP BY substr("snapshotTime", 1, 10)
        ORDER BY "date" ASC
      `,
      startDate,
      end
    )) as Array<{ date: string; gmv: number; paidOrderCount: number }>;

    // 把所有日期补齐(没数据的填 0)
    const byDate = new Map(salesRows.map((r) => [r.date, r]));
    const result: OverviewTrendPoint[] = [];
    for (let i = 0; i < days; i++) {
      const d = this.shiftDate(startDate, i);
      const row = byDate.get(d);
      result.push({
        date: d,
        gmv: Number(row?.gmv ?? 0),
        paidOrderCount: Number(row?.paidOrderCount ?? 0)
      });
    }

    this.writeCache(cacheKey, result);
    return result;
  }

  /**
   * 区域/品类/stale 维度分布。
   * dim='area'   → 按 areaName group by
   * dim='category' → 按 category group by
   * dim='stale'  → 按 stale bucket group by
   */
  async getDistribution(
    dim: 'area' | 'category' | 'stale',
    limit: number
  ): Promise<OverviewDistributionRow[]> {
    const cacheKey = `dist:${dim}:${limit}`;
    const cached = this.readCache<OverviewDistributionRow[]>(cacheKey);
    if (cached) return cached;

    let rows: OverviewDistributionRow[] = [];
    if (dim === 'area' || dim === 'category') {
      const col = dim === 'area' ? 'areaName' : 'category';
      const raw = (await this.prisma.$queryRawUnsafe(
        `
          SELECT "${col}" AS "key", COUNT(*) AS "totalSku",
                 COALESCE(SUM("stockLeft"), 0) AS "stockLeft"
          FROM "ContentPackage"
          WHERE "${col}" IS NOT NULL AND "${col}" <> ''
          GROUP BY "${col}"
          ORDER BY "totalSku" DESC
          LIMIT ?
        `,
        limit
      )) as Array<{ key: string; totalSku: number; stockLeft: number }>;
      rows = raw.map((r) => ({
        key: r.key,
        totalSku: Number(r.totalSku),
        stockLeft: Number(r.stockLeft)
      }));
    } else {
      // stale: 走 PackageSalesDaily 派生阶梯
      const stats = await this.aggregateStaleBucketStats();
      rows = (['stale_60d', 'stale_30d', 'stale_15d', 'stale_7d', 'normal'] as const)
        .map((bucket) => ({
          key: bucket,
          totalSku: stats[bucket] ?? 0,
          stockLeft: 0
        }))
        .filter((r) => r.totalSku > 0)
        .slice(0, limit);
    }

    this.writeCache(cacheKey, rows);
    return rows;
  }

  /**
   * Top N 零动销商家榜单：按 stale_30d SKU 数降序。
   */
  async getTopOffenders(limit: number) {
    const cacheKey = `topOffenders:${limit}`;
    const cached = this.readCache<OverviewTopOffender[]>(cacheKey);
    if (cached) return cached;

    const today = localDateKey(new Date());
    const rules = DEFAULT_INVENTORY_RULES;
    const threshold = this.shiftDate(today, -(rules.stale30Days - 1));

    const rows = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          cp."merchantId",
          MIN(cp."merchantName") AS "merchantName",
          MIN(cp."areaName")     AS "areaName",
          COUNT(DISTINCT cp."packageId") AS "stale30SkuCount",
          (SELECT COUNT(*) FROM "ContentPackage" cp2 WHERE cp2."merchantId" = cp."merchantId") AS "totalSku"
        FROM "ContentPackage" cp
        WHERE cp."stockLeft" > 0
          AND NOT EXISTS (
            SELECT 1 FROM "PackageSalesDaily" s
            WHERE s."packageId" = cp."packageId"
              AND s."salesQty"  > 0
              AND s."date"     >= ?
          )
        GROUP BY cp."merchantId"
        ORDER BY "stale30SkuCount" DESC
        LIMIT ?
      `,
      threshold,
      limit
    )) as Array<{
      merchantId: string;
      merchantName: string;
      areaName: string | null;
      stale30SkuCount: number;
      totalSku: number | null;
    }>;

    const result: OverviewTopOffender[] = rows.map((r) => ({
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      areaName: r.areaName,
      stale30SkuCount: Number(r.stale30SkuCount),
      totalSku: Number(r.totalSku ?? 0)
    }));
    this.writeCache(cacheKey, result);
    return result;
  }

  // ============== 私有：聚合 helpers ==============

  /** 商家总数：从 ContentPackage 表 distinct merchantId（无 Merchant 表） */
  private async countDistinctMerchants(): Promise<number> {
    const [row] = (await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT "merchantId") AS "c" FROM "ContentPackage" WHERE "merchantId" IS NOT NULL AND "merchantId" <> ''`
    )) as Array<{ c: number | null }>;
    return Number(row?.c ?? 0);
  }

  private async aggregateTodayGmv(today: string) {
    const [row] = (await this.prisma.$queryRawUnsafe(
      `
        SELECT COALESCE(SUM("paidAmount"), 0) AS "gmv"
        FROM "SalesSnapshot"
        WHERE substr("snapshotTime", 1, 10) = ?
      `,
      today
    )) as Array<{ gmv: number }>;
    return { gmv: Number(row?.gmv ?? 0) };
  }

  private async aggregateTodayOrderCount(today: string) {
    const [row] = (await this.prisma.$queryRawUnsafe(
      `
        SELECT COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount"
        FROM "SalesSnapshot"
        WHERE substr("snapshotTime", 1, 10) = ?
      `,
      today
    )) as Array<{ paidOrderCount: number }>;
    return { paidOrderCount: Number(row?.paidOrderCount ?? 0) };
  }

  /**
   * 算"有库存 且 30 天内无销售"的 SKU 数 + distinct merchantId 数。
   * 用 NOT EXISTS 子查询避免拉所有 PackageSalesDaily 行的内存负担。
   */
  private async aggregateStaleSkuStats(today: string, rules: InventoryRuleConfig) {
    const threshold = this.shiftDate(today, -(rules.stale30Days - 1));
    const [row] = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          COUNT(*) AS "stale30SkuCount",
          COUNT(DISTINCT "merchantId") AS "distinctMerchants"
        FROM "ContentPackage"
        WHERE "stockLeft" > 0
          AND NOT EXISTS (
            SELECT 1 FROM "PackageSalesDaily" s
            WHERE s."packageId" = "ContentPackage"."packageId"
              AND s."salesQty"  > 0
              AND s."date"     >= ?
          )
      `,
      threshold
    )) as Array<{ stale30SkuCount: number; distinctMerchants: number }>;
    return {
      stale30SkuCount: Number(row?.stale30SkuCount ?? 0),
      distinctMerchants: Number(row?.distinctMerchants ?? 0)
    };
  }

  /**
   * 全量 5 档阶梯 SKU 数（用于 distribution dim='stale' 与下钻）。
   * 注意：跑在请求路径上，数据量大时考虑预计算表（阶段 1 后优化项）。
   */
  private async aggregateStaleBucketStats(): Promise<Record<string, number>> {
    const today = localDateKey(new Date());
    const rules = DEFAULT_INVENTORY_RULES;
    const threshold = this.shiftDate(today, -(rules.stale60Days - 1));

    // 拉所有 (packageId, lastSalesDate) 包 60 天窗口
    const rows = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          cp."packageId",
          cp."stockLeft",
          MAX(s."date") AS "lastSalesDate"
        FROM "ContentPackage" cp
        LEFT JOIN "PackageSalesDaily" s
          ON s."packageId" = cp."packageId"
         AND s."salesQty"  > 0
         AND s."date"     >= ?
        WHERE cp."stockLeft" > 0
        GROUP BY cp."packageId", cp."stockLeft"
      `,
      threshold
    )) as Array<{ packageId: string; stockLeft: number; lastSalesDate: string | null }>;

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

  private shiftDate(yyyyMmDd: string, deltaDays: number): string {
    const t = Date.parse(yyyyMmDd + 'T00:00:00Z');
    if (!Number.isFinite(t)) return yyyyMmDd;
    const next = new Date(t + deltaDays * 86400000);
    return localDateKey(next);
  }

  private readCache<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private writeCache<T>(key: string, value: T) {
    this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  }

  /** 暴露给 RuleConfigService 等写操作后清缓存用 */
  invalidateCache(prefix?: string) {
    if (!prefix) {
      this.cache.clear();
      return;
    }
    for (const k of this.cache.keys()) {
      if (k.startsWith(prefix)) this.cache.delete(k);
    }
  }
}

// ============== 响应 DTO 类型（不挂 class-validator，类内字段已聚合） ==============

export interface OverviewKpiPayload {
  date: string;
  totalMerchants: number;
  totalSkus: number;
  zeroSalesMerchants: number;
  zeroSalesSkuCount: number;
  zeroSalesSkuRatio: number;
  todayGmv: number;
  todayOrderCount: number;
  updatedAt: string;
  dataSource: string;
}

export interface OverviewTrendPoint {
  date: string;
  gmv: number;
  paidOrderCount: number;
}

export interface OverviewDistributionRow {
  key: string;
  totalSku: number;
  stockLeft: number;
}

export interface OverviewTopOffender {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  stale30SkuCount: number;
  totalSku: number;
}
