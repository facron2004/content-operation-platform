import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { localDateKey } from '@content/shared';
import type { MerchantTrendQueryDto, MerchantsListQueryDto } from './dto/merchant-query.dto';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';

/**
 * 中台数据层：商家分析。
 * - /merchants: 商家列表 + stale_30d 占比
 * - /merchants/:id/profile: 商家画像
 * - /merchants/:id/trend: 30/60/90 天 GMV/订单/转化趋势
 * - /merchants/:id/skus: 该商家 SKU 清单（含 stale flag）
 * - /merchants/:id/competitors: 同 area 同 category 竞品（供对比卡片）
 */
@Injectable()
export class MerchantService {
  private readonly logger = new Logger(MerchantService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** 商家列表：带 stale_30d SKU 数 + 30 天 GMV 汇总 */
  async listMerchants(q: MerchantsListQueryDto) {
    const today = localDateKey(new Date());
    const rules = DEFAULT_INVENTORY_RULES;
    const staleThreshold = this.shiftDate(today, -(rules.stale30Days - 1));

    // Prisma 6 SQLite 对复杂 raw query 聚合抛 "datatype mismatch" — 用 typed findMany + 内存聚合
    const offset = (q.page - 1) * q.pageSize;

    type Item = {
      merchantId: string;
      merchantName: string;
      areaId: string | null;
      areaName: string | null;
      totalSku: number;
      stale30SkuCount: number;
      stale30Ratio: number;
      totalGmv30d: number;
    };

    // 1) 从 ContentPackage 取 distinct 商家（无独立 Merchant 表）
    const merchants = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          "merchantId",
          MIN("merchantName") AS "merchantName",
          MIN("areaId")       AS "areaId",
          MIN("areaName")     AS "areaName",
          COUNT(*)            AS "totalSku"
        FROM "ContentPackage"
        WHERE "merchantId" IS NOT NULL AND "merchantId" <> ''
          ${q.areaId ? `AND "areaId" = '${q.areaId.replace(/'/g, "''")}'` : ''}
          ${q.search ? `AND "merchantName" LIKE '%${q.search.replace(/'/g, "''")}%'` : ''}
        GROUP BY "merchantId"
      `
    )) as Array<{
      merchantId: string;
      merchantName: string;
      areaId: string | null;
      areaName: string | null;
      totalSku: number;
    }>;

    // 2) 拿这些商家所有有库存 SKU
    const merchantIds = merchants.map((m: { merchantId: string }) => m.merchantId);
    const packages = merchantIds.length
      ? await this.prisma.contentPackage.findMany({
          where: { merchantId: { in: merchantIds }, stockLeft: { gt: 0 } },
          select: { packageId: true, merchantId: true }
        })
      : [];

    // 3) 拿这些 SKU 30 天内是否有销售(过滤零动销)
    const pkgIds = packages.map((p: { packageId: string }) => p.packageId);
    const stale30PackageIds = new Set<string>();
    if (pkgIds.length) {
      // 找出 30 天内有过销售的 packageId (从这些里减掉)
      const recentSales = await this.prisma.packageSalesDaily.findMany({
        where: { packageId: { in: pkgIds }, date: { gte: staleThreshold }, salesQty: { gt: 0 } },
        select: { packageId: true }
      });
      const recentSet = new Set(recentSales.map((r: { packageId: string }) => r.packageId));
      for (const pid of pkgIds) if (!recentSet.has(pid)) stale30PackageIds.add(pid);
    }

    // 4) 按 merchantId group by
    const stale30ByMerchant = new Map<string, number>();
    for (const pid of stale30PackageIds) {
      const merchantId = packages.find(
        (p: { packageId: string; merchantId: string }) => p.packageId === pid
      )?.merchantId;
      if (merchantId)
        stale30ByMerchant.set(merchantId, (stale30ByMerchant.get(merchantId) ?? 0) + 1);
    }

    // 5) 30 天 GMV 汇总
    const gmvByMerchant = new Map<string, number>();
    if (pkgIds.length) {
      const gmvRows = await this.prisma.packageSalesDaily.groupBy({
        by: ['packageId'],
        where: { packageId: { in: pkgIds }, date: { gte: staleThreshold }, salesQty: { gt: 0 } },
        _sum: { salesAmount: true }
      });
      // Prisma SQLite 把 _sum.salesAmount 推为 unknown(Decimal|BigInt|null),显式 Number 化
      type GmvRow = { packageId: string; _sum: { salesAmount: unknown } };
      const gmvByPackage = new Map<string, number>(
        (gmvRows as GmvRow[]).map((r) => [r.packageId, Number(r._sum.salesAmount ?? 0)])
      );
      for (const p of packages as Array<{ packageId: string; merchantId: string }>) {
        gmvByMerchant.set(
          p.merchantId,
          (gmvByMerchant.get(p.merchantId) ?? 0) + (gmvByPackage.get(p.packageId) ?? 0)
        );
      }
    }

    const items: Item[] = merchants.map(
      (m: {
        merchantId: string;
        merchantName: string;
        areaId: string | null;
        areaName: string | null;
        totalSku: number;
      }): Item => ({
        merchantId: m.merchantId,
        merchantName: m.merchantName,
        areaId: m.areaId,
        areaName: m.areaName,
        totalSku: m.totalSku,
        stale30SkuCount: stale30ByMerchant.get(m.merchantId) ?? 0,
        stale30Ratio: m.totalSku > 0 ? (stale30ByMerchant.get(m.merchantId) ?? 0) / m.totalSku : 0,
        totalGmv30d: gmvByMerchant.get(m.merchantId) ?? 0
      })
    );

    // 6) 排序
    if (q.sort === 'totalSkuDesc')
      items.sort((a, b) => b.totalSku - a.totalSku || a.merchantId.localeCompare(b.merchantId));
    else if (q.sort === 'totalGmvDesc')
      items.sort(
        (a, b) => b.totalGmv30d - a.totalGmv30d || a.merchantId.localeCompare(b.merchantId)
      );
    else
      items.sort(
        (a, b) => b.stale30SkuCount - a.stale30SkuCount || a.merchantId.localeCompare(b.merchantId)
      );
    const paged = items.slice(offset, offset + q.pageSize);

    return {
      items,
      pagination: {
        page: q.page,
        pageSize: q.pageSize,
        hasMore: items.length === q.pageSize
      }
    };
  }

  /** 商家画像：从 ContentPackage 聚合基础信息 + 30 天零动销占比 */
  async getProfile(merchantId: string) {
    const [m] = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          "merchantId",
          MIN("merchantName") AS "merchantName",
          MIN("areaId")       AS "areaId",
          MIN("areaName")     AS "areaName",
          COUNT(*)            AS "totalSku"
        FROM "ContentPackage"
        WHERE "merchantId" = ?
      `,
      merchantId
    )) as
      | Array<{
          merchantId: string;
          merchantName: string;
          areaId: string | null;
          areaName: string | null;
          totalSku: number;
        }>
      | undefined;
    if (!m) {
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
    const today = localDateKey(new Date());
    const rules = DEFAULT_INVENTORY_RULES;
    const staleThreshold = this.shiftDate(today, -(rules.stale30Days - 1));
    const [staleRow] = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          COUNT(*) AS "stale30SkuCount"
        FROM "ContentPackage"
        WHERE "merchantId" = ?
          AND "stockLeft" > 0
          AND NOT EXISTS (
            SELECT 1 FROM "PackageSalesDaily" s
            WHERE s."packageId" = "ContentPackage"."packageId"
              AND s."salesQty"  > 0
              AND s."date"     >= ?
          )
      `,
      merchantId,
      staleThreshold
    )) as Array<{ stale30SkuCount: number }>[];

    return {
      merchantId: m.merchantId,
      merchantName: m.merchantName,
      areaId: m.areaId,
      areaName: m.areaName,
      totalSku: m.totalSku,
      stale30SkuCount: Number(staleRow?.[0]?.stale30SkuCount ?? 0),
      stale30Ratio: m.totalSku > 0 ? Number(staleRow?.[0]?.stale30SkuCount ?? 0) / m.totalSku : 0
    };
  }

  /** 商家 30/60/90 天 GMV + 订单 + 转化趋势 */
  async getTrend(merchantId: string, query: MerchantTrendQueryDto) {
    const today = localDateKey(new Date());
    const start = this.shiftDate(today, -(query.days - 1));

    const rows = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          substr(ss."snapshotTime", 1, 10) AS "date",
          COALESCE(SUM(ss."gmv"), 0)            AS "gmv",
          COALESCE(SUM(ss."paidOrderCount"), 0) AS "paidOrderCount",
          COALESCE(SUM(ss."orderCount"), 0)     AS "orderCount",
          COALESCE(SUM(ss."exposureCount"), 0)  AS "exposureCount",
          COALESCE(SUM(ss."clickCount"), 0)     AS "clickCount"
        FROM "SalesSnapshot" ss
        JOIN "ContentPackage" cp ON cp."packageId" = ss."packageId"
        WHERE cp."merchantId" = ?
          AND substr(ss."snapshotTime", 1, 10) >= ?
          AND substr(ss."snapshotTime", 1, 10) <= ?
        GROUP BY substr(ss."snapshotTime", 1, 10)
        ORDER BY "date" ASC
      `,
      merchantId,
      start,
      today
    )) as Array<{
      date: string;
      gmv: number;
      paidOrderCount: number;
      orderCount: number;
      exposureCount: number;
      clickCount: number;
    }>;

    // 补齐日期序列 + 计算转化率
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const trend: Array<{
      date: string;
      gmv: number;
      paidOrderCount: number;
      orderCount: number;
      exposureCount: number;
      clickCount: number;
      conversionRate: number;
    }> = [];
    for (let i = 0; i < query.days; i++) {
      const d = this.shiftDate(start, i);
      const r = byDate.get(d);
      const exposure = Number(r?.exposureCount ?? 0);
      const click = Number(r?.clickCount ?? 0);
      const order = Number(r?.orderCount ?? 0);
      trend.push({
        date: d,
        gmv: Number(r?.gmv ?? 0),
        paidOrderCount: Number(r?.paidOrderCount ?? 0),
        orderCount: order,
        exposureCount: exposure,
        clickCount: click,
        conversionRate: click > 0 ? order / click : 0
      });
    }
    return { merchantId, days: query.days, trend };
  }

  /** 该商家 SKU 清单（含 stale flag） */
  async listSkus(merchantId: string, query: MerchantTrendQueryDto) {
    const today = localDateKey(new Date());
    const rules = DEFAULT_INVENTORY_RULES;
    const threshold = this.shiftDate(today, -(rules.stale60Days - 1));

    const rows = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          cp."packageId",
          cp."packageName",
          cp."areaName",
          cp."category",
          cp."salePrice",
          cp."stockLeft",
          MAX(sd."date") AS "lastSalesDate",
          CAST(julianday('${today}') - julianday(MAX(sd."date")) AS INTEGER) AS "daysSinceLastSale"
        FROM "ContentPackage" cp
        LEFT JOIN "PackageSalesDaily" sd
          ON sd."packageId" = cp."packageId"
         AND sd."salesQty"  > 0
         AND sd."date"     >= ?
        WHERE cp."merchantId" = ?
        GROUP BY cp."packageId"
        ORDER BY "daysSinceLastSale" DESC NULLS FIRST
      `,
      threshold,
      merchantId
    )) as Array<{
      packageId: string;
      packageName: string;
      areaName: string;
      category: string;
      salePrice: number;
      stockLeft: number;
      lastSalesDate: string | null;
      daysSinceLastSale: number | null;
    }>;

    const items = rows.map((r) => {
      const days = r.daysSinceLastSale ?? 9999;
      const staleBucket =
        days >= rules.stale60Days
          ? 'stale_60d'
          : days >= rules.stale30Days
            ? 'stale_30d'
            : days >= rules.stale15Days
              ? 'stale_15d'
              : days >= rules.stale7Days
                ? 'stale_7d'
                : 'normal';
      return {
        packageId: r.packageId,
        packageName: r.packageName,
        areaName: r.areaName,
        category: r.category,
        salePrice: Number(r.salePrice),
        stockLeft: Number(r.stockLeft),
        lastSalesDate: r.lastSalesDate,
        daysSinceLastSale: days,
        staleBucket
      };
    });

    return { merchantId, count: items.length, items };
  }

  /** 同 area 同 category 竞品（top 5） */
  async listCompetitors(merchantId: string) {
    // 无独立 Merchant 表，从 ContentPackage 聚合 self 信息
    const [self] = (await this.prisma.$queryRawUnsafe(
      `SELECT "merchantId", MIN("areaId") AS "areaId" FROM "ContentPackage" WHERE "merchantId" = ?`,
      merchantId
    )) as Array<{ merchantId: string; areaId: string | null }> | undefined;
    if (!self) return { merchantId, competitors: [] };

    const competitors = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          cp."merchantId",
          MIN(cp."merchantName") AS "merchantName",
          MIN(cp."areaName")     AS "areaName",
          cp."category",
          COUNT(*)               AS "skuCount",
          COALESCE(SUM(cp."salePrice"), 0) AS "totalPrice"
        FROM "ContentPackage" cp
        WHERE cp."merchantId" != ?
          AND cp."category" IN (
            SELECT DISTINCT "category" FROM "ContentPackage" WHERE "merchantId" = ?
          )
          AND cp."areaId" = ?
        GROUP BY cp."merchantId", cp."category"
        ORDER BY "skuCount" DESC
        LIMIT 5
      `,
      merchantId,
      merchantId,
      self.areaId ?? ''
    )) as Array<{
      merchantId: string;
      merchantName: string;
      areaName: string;
      category: string;
      skuCount: number;
      totalPrice: number;
    }>;

    return {
      merchantId,
      competitors: competitors.map((c) => ({
        merchantId: c.merchantId,
        merchantName: c.merchantName,
        areaName: c.areaName,
        category: c.category,
        skuCount: Number(c.skuCount),
        totalPrice: Number(c.totalPrice)
      }))
    };
  }

  private shiftDate(yyyyMmDd: string, deltaDays: number): string {
    const t = Date.parse(yyyyMmDd + 'T00:00:00Z');
    if (!Number.isFinite(t)) return yyyyMmDd;
    const next = new Date(t + deltaDays * 86400000);
    return localDateKey(next);
  }
}
