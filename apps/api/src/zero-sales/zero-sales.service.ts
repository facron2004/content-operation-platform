import { Inject, Injectable, Logger } from '@nestjs/common';
import type { InventoryRuleConfig } from '../domain/rules-defaults';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import { PrismaService } from '../prisma/prisma.service';
import { localDateKey } from '@content/shared';
import type {
  StaleBucket,
  ZeroSalesMerchantsQueryDto,
  ZeroSalesSkusQueryDto
} from './dto/zero-sales-query.dto';

/**
 * 中台数据层：零动销清单（商家 + SKU）。
 * 复用 OverviewService 的同源计算：lastSalesDate + currentStockLeft + rules 阶梯。
 * 不强制 5 min 缓存（清单需要每次新），但单 SQL 走 group by + 索引避免 N+1。
 */
@Injectable()
export class ZeroSalesService {
  private readonly logger = new Logger(ZeroSalesService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * 商家清单：按 merchantId group by，输出 stale_30d SKU 数 + 30 天 GMV + 评分均值。
   * staleBucket 默认 stale_30d；其他 bucket 走同一 SQL 替换 threshold。
   */
  async listMerchants(q: ZeroSalesMerchantsQueryDto) {
    const today = localDateKey(new Date());
    const rules = DEFAULT_INVENTORY_RULES;
    const days = this.staleDaysFromBucket(q.staleBucket, rules);
    const threshold = this.shiftDate(today, -(days - 1));

    // 构造 WHERE:有库存 + 窗口内无 salesQty>0
    // threshold 同时用于外层 JOIN(算 GMV/salesAmount 窗口) 与内层 NOT EXISTS(算零动销判定窗口) — 两个 ? 各算一次
    const params: Array<string> = [threshold, threshold];
    let merchantFilter = '';
    let areaFilter = '';
    if (q.merchantId) {
      merchantFilter = 'AND cp."merchantId" = ?';
      params.push(q.merchantId);
    }
    if (q.areaId) {
      areaFilter = 'AND cp."areaId" = ?';
      params.push(q.areaId);
    }
    if (q.search) {
      merchantFilter += ' AND m."merchantName" LIKE ?';
      params.push(`%${q.search}%`);
    }

    const offset = (q.page - 1) * q.pageSize;

    // 1) 候选 package (有库存 + 窗口内无 salesQty>0) — typed findMany,NOT EXISTS 用反向 NOT 表达
    type CandidateRow = {
      packageId: string;
      merchantId: string;
      merchantName: string;
      areaName: string | null;
      areaId: string | null;
    };
    const candidates = (await this.prisma.contentPackage.findMany({
      where: {
        stockLeft: { gt: 0 },
        ...(q.merchantId ? { merchantId: q.merchantId } : {}),
        ...(q.areaId ? { areaId: q.areaId } : {}),
        ...(q.search ? { merchantName: { contains: q.search } } : {})
      },
      select: {
        packageId: true,
        merchantId: true,
        merchantName: true,
        areaName: true,
        areaId: true
      }
    })) as CandidateRow[];

    // 2) 内存过滤掉有销售的 (替代 NOT EXISTS,避免 Prisma 6 SQLite typed query 复杂 where 的兼容问题)
    const candidatePackageIds = candidates.map((c: CandidateRow) => c.packageId);
    const recentSalesPackageIds = new Set<string>();
    if (candidatePackageIds.length) {
      const recent = await this.prisma.packageSalesDaily.findMany({
        where: {
          packageId: { in: candidatePackageIds },
          date: { gte: threshold },
          salesQty: { gt: 0 }
        },
        select: { packageId: true }
      });
      for (const r of recent) recentSalesPackageIds.add(r.packageId);
    }
    const filteredCandidates = candidates.filter(
      (c: CandidateRow) => !recentSalesPackageIds.has(c.packageId)
    );

    // 3) 内存 group by merchantId
    type MerchantAcc = {
      merchantId: string;
      merchantName: string;
      areaName: string;
      areaId: string;
      packageIds: string[];
    };
    const byMerchant = new Map<string, MerchantAcc>();
    for (const r of filteredCandidates) {
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

    // 4) 30 天 GMV 汇总
    const filteredIds = filteredCandidates.map((c: CandidateRow) => c.packageId);
    const gmvByPackage = new Map<string, number>();
    if (filteredIds.length) {
      const gmvRows = await this.prisma.packageSalesDaily.groupBy({
        by: ['packageId'],
        where: {
          packageId: { in: filteredIds },
          date: { gte: threshold },
          salesQty: { gt: 0 }
        },
        _sum: { salesAmount: true }
      });
      for (const g of gmvRows) gmvByPackage.set(g.packageId, Number(g._sum.salesAmount ?? 0));
    }

    // 5) 最近一次销售日 (按 packageId 取 max(date), 内存取每个 merchant 最大)
    const lastSalesByMerchant = new Map<string, string>();
    if (filteredIds.length) {
      const recent = await this.prisma.packageSalesDaily.findMany({
        where: { packageId: { in: filteredIds }, salesQty: { gt: 0 } },
        select: { packageId: true, date: true },
        orderBy: { date: 'desc' },
        take: 2000
      });
      const merchantOf = new Map(
        filteredCandidates.map((c: CandidateRow) => [c.packageId, c.merchantId])
      );
      for (const r of recent) {
        const m = merchantOf.get(r.packageId);
        if (m && !lastSalesByMerchant.has(m)) lastSalesByMerchant.set(m, r.date);
      }
    }

    // 6) 商家 totalSku
    const totalSkuByMerchant = new Map<string, number>();
    if (byMerchant.size) {
      // 无独立 Merchant 表，用 ContentPackage 聚合 totalSku
      for (const [merchantId] of byMerchant) {
        const [r] = (await this.prisma.$queryRawUnsafe(
          `SELECT COUNT(*) AS "c" FROM "ContentPackage" WHERE "merchantId" = ?`,
          merchantId
        )) as Array<{ c: number }>;
        totalSkuByMerchant.set(merchantId, Number(r?.c ?? 0));
      }
    }

    // 7) 排序 + 分页
    const gmvByMerchant = new Map<string, number>();
    for (const m of byMerchant.values()) {
      let sum = 0;
      for (const pid of m.packageIds) sum += gmvByPackage.get(pid) ?? 0;
      gmvByMerchant.set(m.merchantId, sum);
    }

    const allItems = [...byMerchant.values()].map((m) => ({
      merchantId: m.merchantId,
      merchantName: m.merchantName,
      areaName: m.areaName,
      areaId: m.areaId,
      totalSku: totalSkuByMerchant.get(m.merchantId) ?? 0,
      staleSkuCount: m.packageIds.length,
      staleGmv30d: gmvByMerchant.get(m.merchantId) ?? 0,
      lastSalesDate: lastSalesByMerchant.get(m.merchantId) ?? null
    }));
    allItems.sort(
      (a, b) => b.staleSkuCount - a.staleSkuCount || a.merchantId.localeCompare(b.merchantId)
    );
    const items = allItems.slice(offset, offset + q.pageSize);

    return {
      items,
      pagination: {
        page: q.page,
        pageSize: q.pageSize,
        total: items.length < q.pageSize ? offset + items.length : offset + items.length + 1,
        // ⚠️ 简化：list 接口因为 group by + distinct 不易精准 count，
        // 客户端用 hasMore 翻页判断（item 长度 == pageSize 即可继续翻）。
        hasMore: items.length === q.pageSize
      }
    };
  }

  /**
   * SKU 清单：单个 SKU 维度。带 stale bucket 计算。
   * sort 选项：
   *  - lastSalesDateAsc (默认) - 上次销售日从最远到最近
   *  - staleDesc - 阶梯严重度从高到低
   *  - gmvDesc - 30 天 GMV 降序
   */
  async listSkus(q: ZeroSalesSkusQueryDto) {
    const today = localDateKey(new Date());
    const rules = DEFAULT_INVENTORY_RULES;
    const days = q.staleBucket ? this.staleDaysFromBucket(q.staleBucket, rules) : rules.stale7Days;
    const threshold = this.shiftDate(today, -(days - 1));

    // SQL 占位符顺序:
    //   1) sd JOIN: sd.date >= ?           (threshold)
    //   2) merchantId (可选)
    //   3) category (可选)
    //   4) areaId (可选)
    //   5) search (1 个 LIKE,绑定后是 2 个 ?, 因 packages.name/merchantName 各一个)
    //   6) NOT EXISTS: s.date >= ?         (threshold)
    const params: Array<string> = [threshold];
    const filters: string[] = ['cp."stockLeft" > 0'];

    if (q.merchantId) {
      filters.push('cp."merchantId" = ?');
      params.push(q.merchantId);
    }
    if (q.category) {
      filters.push('cp."category" = ?');
      params.push(q.category);
    }
    if (q.areaId) {
      filters.push('cp."areaId" = ?');
      params.push(q.areaId);
    }
    if (q.search) {
      filters.push('(cp."packageName" LIKE ? OR cp."merchantName" LIKE ?)');
      params.push(`%${q.search}%`, `%${q.search}%`);
    }

    filters.push(`NOT EXISTS (
      SELECT 1 FROM "PackageSalesDaily" s
      WHERE s."packageId" = cp."packageId"
        AND s."salesQty"  > 0
        AND s."date"     >= ?
    )`);
    params.push(threshold);

    const orderBy =
      q.sort === 'lastSalesDateAsc'
        ? '"lastSalesDate" ASC NULLS FIRST, cp."packageId" ASC'
        : q.sort === 'staleDesc'
          ? '"daysSinceLastSale" DESC NULLS FIRST, cp."packageId" ASC'
          : '"staleGmv30d" DESC, cp."packageId" ASC';

    const offset = (q.page - 1) * q.pageSize;
    params.push(String(q.pageSize), String(offset));

    const rows = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          cp."packageId",
          cp."packageName",
          cp."merchantId",
          cp."merchantName",
          cp."areaName",
          cp."category",
          cp."salePrice",
          cp."stockLeft",
          cp."stockTotal",
          MAX(sd."date") AS "lastSalesDate",
          CAST(julianday('${today}') - julianday(MAX(sd."date")) AS INTEGER) AS "daysSinceLastSale",
          COALESCE(SUM(sd."salesAmount"), 0) AS "staleGmv30d",
          COALESCE(SUM(sd."salesQty"), 0)     AS "staleSalesQty30d"
        FROM "ContentPackage" cp
        LEFT JOIN "PackageSalesDaily" sd
          ON sd."packageId" = cp."packageId"
         AND sd."salesQty"  > 0
         AND sd."date"     >= ?
        WHERE ${filters.join(' AND ')}
        GROUP BY cp."packageId"
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `,
      ...params
    )) as Array<{
      packageId: string;
      packageName: string;
      merchantId: string;
      merchantName: string;
      areaName: string;
      category: string;
      salePrice: number;
      stockLeft: number;
      stockTotal: number;
      lastSalesDate: string | null;
      daysSinceLastSale: number | null;
      staleGmv30d: number;
      staleSalesQty30d: number;
    }>;

    const items = rows.map((r) => {
      const days = r.daysSinceLastSale ?? 9999;
      const bucket: StaleBucket =
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
        merchantId: r.merchantId,
        merchantName: r.merchantName,
        areaName: r.areaName,
        category: r.category,
        salePrice: Number(r.salePrice),
        stockLeft: Number(r.stockLeft),
        stockTotal: Number(r.stockTotal),
        lastSalesDate: r.lastSalesDate,
        daysSinceLastSale: days,
        staleBucket: bucket,
        staleGmv30d: Number(r.staleGmv30d),
        staleSalesQty30d: Number(r.staleSalesQty30d)
      };
    });

    return {
      items,
      pagination: {
        page: q.page,
        pageSize: q.pageSize,
        hasMore: items.length === q.pageSize
      }
    };
  }

  /**
   * 单 SKU 零动销时间线：30/60/90 天 stockLeft + salesQty 序列。
   * 用于 ZeroSalesView 操作列"查看分析"前的预览。
   */
  async getSkuTimeline(packageId: string, days: number) {
    const today = localDateKey(new Date());
    const start = this.shiftDate(today, -(days - 1));
    const rows = (await this.prisma.$queryRawUnsafe(
      `
        SELECT "snapshotDate" AS "date", "remainingStock" AS "stockLeft"
        FROM "JeeSiteInventoryDailySnapshot"
        WHERE "packageId" = ? AND "snapshotDate" >= ? AND "snapshotDate" <= ?
        ORDER BY "snapshotDate" ASC
      `,
      packageId,
      start,
      today
    )) as Array<{ date: string; stockLeft: number }>;

    const sales = (await this.prisma.$queryRawUnsafe(
      `
        SELECT "date", "salesQty", "deltaSource"
        FROM "PackageSalesDaily"
        WHERE "packageId" = ? AND "date" >= ? AND "date" <= ?
        ORDER BY "date" ASC
      `,
      packageId,
      start,
      today
    )) as Array<{ date: string; salesQty: number; deltaSource: string }>;

    const salesByDate = new Map(sales.map((s) => [s.date, s]));
    const stockByDate = new Map(rows.map((r) => [r.date, r.stockLeft]));

    // 补齐日期序列
    const timeline: Array<{
      date: string;
      stockLeft: number;
      salesQty: number;
      deltaSource: string;
    }> = [];
    for (let i = 0; i < days; i++) {
      const d = this.shiftDate(start, i);
      timeline.push({
        date: d,
        stockLeft: Number(stockByDate.get(d) ?? 0),
        salesQty: Number(salesByDate.get(d)?.salesQty ?? 0),
        deltaSource: salesByDate.get(d)?.deltaSource ?? 'no_data'
      });
    }
    return { packageId, days, timeline };
  }

  /**
   * 把 bucket 字符串转成对应的"窗口天数"。
   * normal → 0（不用）, stale_60d → 60, 等等。
   */
  private staleDaysFromBucket(bucket: StaleBucket, rules: InventoryRuleConfig): number {
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

  private shiftDate(yyyyMmDd: string, deltaDays: number): string {
    const t = Date.parse(yyyyMmDd + 'T00:00:00Z');
    if (!Number.isFinite(t)) return yyyyMmDd;
    const next = new Date(t + deltaDays * 86400000);
    return localDateKey(next);
  }
}
