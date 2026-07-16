import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { beijingDateKey, beijingDayRangeUtc, isRecord } from '@content/shared';
import { AutoLoginService } from '../content/auto-login.service';
import { MerchantSalesService } from '../merchant-sales/merchant-sales.service';
import type {
  GmvDistributionDim,
  GmvMerchantSort,
  TrendWindow
} from './dto/gmv-query.dto';

/**
 * 中台数据层:GMV 看板。
 * 数据源优先 OrderHeader (JeSite ETL 真实订单),
 * 回退 DailyMetrics 聚合表,缺失数据时再回退 SalesSnapshot 实时 SQL 聚合。
 *
 * GMV 公式 (披露口径 — 用户确认):
 *   GMV = paidAmount + paidAmountWallet       ← 在线现金 + 余额支付 (积分抵现不计入)
 *   净 GMV = GMV − refundAmount
 *   退款率 = refundAmount / GMV
 *   核销率 = verifyAmount / GMV
 *   积分抵现 paidAmountBonus 单独披露,不重复计入 GMV
 */

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface GmvTodayPayload {
  date: string;
  totalGmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
  gmvCard: number;
  totalRefund: number;
  refundRate: number;
  totalVerify: number;
  verifyRate: number;
  paidOrderCount: number;
  paidAmountBonus: number;
  paidAmountWallet: number;
  updatedAt: string;
  dataSource: 'DailyMetrics' | 'SalesSnapshot' | 'OrderHeader';
}

export interface GmvTrendPoint {
  date: string;
  totalGmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
  totalRefund: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
}

export interface GmvDistributionRow {
  key: string;
  totalGmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
  share: number; // 0..1
}

export interface GmvMerchantRow {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  gmv: number;
  gmvRefund: number;
  gmvVerify: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
}

@Injectable()
export class GmvService {
  private readonly logger = new Logger(GmvService.name);
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AutoLoginService) private readonly autoLogin?: AutoLoginService,
    @Optional() private readonly moduleRef?: ModuleRef
  ) {}

  /** 延迟解析 MerchantSalesService,避开 Gmv ↔ MerchantSales 模块循环依赖。 */
  private async getMerchantSalesService(): Promise<MerchantSalesService | null> {
    if (!this.moduleRef) return null;
    try {
      return this.moduleRef.get(MerchantSalesService, { strict: false });
    } catch {
      return null;
    }
  }

  // -------- public API --------

  async getKpis(date?: string, force = false): Promise<GmvTodayPayload> {
    const cacheKey = `gmvToday:${date ?? 'today'}`;
    if (!force) {
      const cached = this.readCache<GmvTodayPayload>(cacheKey);
      if (cached) return cached;
    } else {
      // 强制刷新时清掉旧缓存,避免下次再读到旧值
      this.cache.delete(cacheKey);
    }
    const targetDate = date ?? beijingDateKey(new Date());

    // 0) 最高优先级:OrderHeader 实时聚合(JeSite ETL 拉的真实订单)
    const oh = await this.computeFromOrderHeader(targetDate);
    if (oh.paidOrderCount > 0 || oh.totalGmv > 0) {
      this.writeCache(cacheKey, oh);
      return oh;
    }

    // 1) DailyMetrics 聚合表
    const dmRow = await this.prisma.dailyMetrics.findUnique({ where: { date: targetDate } });
    if (dmRow) {
      const payload: GmvTodayPayload = {
        date: dmRow.date,
        totalGmv: Number(dmRow.totalGmv),
        gmvOnline: Number(dmRow.gmvOnline),
        gmvWallet: Number(dmRow.gmvWallet),
        gmvBonus: Number(dmRow.gmvBonus),
        gmvCard: Number(dmRow.gmvCard),
        totalRefund: Number(dmRow.totalRefund),
        refundRate: Number(dmRow.refundRate),
        totalVerify: Number(dmRow.totalVerify),
        verifyRate: Number(dmRow.verifyRate),
        paidOrderCount: dmRow.paidOrderCount,
        paidAmountBonus: Number(dmRow.paidAmountBonus),
        paidAmountWallet: Number(dmRow.paidAmountWallet),
        updatedAt: dmRow.updatedAt.toISOString(),
        dataSource: 'DailyMetrics'
      };
      this.writeCache(cacheKey, payload);
      return payload;
    }

    // 2) 回退 SalesSnapshot (按日聚合)
    const raw = await this.computeFromSalesSnapshot(targetDate);
    this.writeCache(cacheKey, raw);
    return raw;
  }

  async getTrend(days: TrendWindow, endDate?: string, force = false): Promise<GmvTrendPoint[]> {
    const cacheKey = `gmvTrend:${days}:${endDate ?? 'today'}`;
    if (!force) {
      const cached = this.readCache<GmvTrendPoint[]>(cacheKey);
      if (cached) return cached;
    } else {
      this.cache.delete(cacheKey);
    }

    const end = endDate ?? beijingDateKey(new Date());
    const start = this.shiftDate(end, -(days - 1));

    const dmRows = await this.prisma.dailyMetrics.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'asc' }
    });
    if (dmRows.length) {
      type DmRow = {
        date: string;
        totalGmv: number;
        gmvOnline: number;
        gmvWallet: number;
        gmvBonus: number;
        totalRefund: number;
        refundRate: number;
        verifyRate: number;
        paidOrderCount: number;
      };
      const result: GmvTrendPoint[] = dmRows.map((r: DmRow): GmvTrendPoint => ({
        date: r.date,
        totalGmv: Number(r.totalGmv),
        gmvOnline: Number(r.gmvOnline),
        gmvWallet: Number(r.gmvWallet),
        gmvBonus: Number(r.gmvBonus),
        totalRefund: Number(r.totalRefund),
        refundRate: Number(r.refundRate),
        verifyRate: Number(r.verifyRate),
        paidOrderCount: r.paidOrderCount
      }));
      // 补齐日期序列 (没数据的日期填 0)
      const byDate = new Map<string, GmvTrendPoint>(
        result.map((p: GmvTrendPoint) => [p.date, p])
      );
      const empty: GmvTrendPoint = {
        date: '',
        totalGmv: 0,
        gmvOnline: 0,
        gmvWallet: 0,
        gmvBonus: 0,
        totalRefund: 0,
        refundRate: 0,
        verifyRate: 0,
        paidOrderCount: 0
      };
      const filled: GmvTrendPoint[] = [];
      for (let i = 0; i < days; i++) {
        const d = this.shiftDate(start, i);
        filled.push(byDate.get(d) ?? { ...empty, date: d });
      }
      this.writeCache(cacheKey, filled);
      return filled;
    }

    // 第三层:OrderHeader 实时按日聚合(JeSite ETL 真实订单,优先级低于 DailyMetrics 缓存但高于 SalesSnapshot)
    const ohRows = await this.computeTrendFromOrderHeader(start, end);
    if (ohRows.some((r) => r.paidOrderCount > 0 || r.totalGmv > 0)) {
      this.writeCache(cacheKey, ohRows);
      return ohRows;
    }

    // 第四层:SalesSnapshot (按日聚合,legacy 数据)
    const rows = (await this.prisma.$queryRawUnsafe(
      `
        SELECT date(datetime("snapshotTime" / 1000, 'unixepoch')) AS "date",
               COALESCE(SUM("paidAmountOnline"), 0) AS "gmvOnline",
               COALESCE(SUM("paidAmountWallet"), 0) AS "gmvWallet",
               COALESCE(SUM("paidAmountBonus"), 0) AS "gmvBonus",
               COALESCE(SUM("refundAmount"), 0) AS "totalRefund",
               COALESCE(SUM("verifyAmount"), 0) AS "totalVerify",
               COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount"
        FROM "SalesSnapshot"
        WHERE date(datetime("snapshotTime" / 1000, 'unixepoch')) >= ? AND date(datetime("snapshotTime" / 1000, 'unixepoch')) <= ?
        GROUP BY date(datetime("snapshotTime" / 1000, 'unixepoch'))
        ORDER BY "date" ASC
      `,
      start,
      end
    )) as Array<{
      date: string;
      gmvOnline: number;
      gmvWallet: number;
      gmvBonus: number;
      totalRefund: number;
      totalVerify: number;
      paidOrderCount: number;
    }>;

    const byDate = new Map(rows.map((r) => [r.date, r]));
    const result: GmvTrendPoint[] = [];
    for (let i = 0; i < days; i++) {
      const d = this.shiftDate(start, i);
      const r = byDate.get(d);
      const gmv = Number(r?.gmvOnline ?? 0) + Number(r?.gmvWallet ?? 0); // 在线现金 + 余额 (积分不计)
      const totalRefund = Number(r?.totalRefund ?? 0);
      const totalVerify = Number(r?.totalVerify ?? 0);
      result.push({
        date: d,
        totalGmv: gmv,
        gmvOnline: Number(r?.gmvOnline ?? 0),
        gmvWallet: Number(r?.gmvWallet ?? 0),
        gmvBonus: Number(r?.gmvBonus ?? 0),
        totalRefund,
        refundRate: gmv > 0 ? totalRefund / gmv : 0,
        verifyRate: gmv > 0 ? totalVerify / gmv : 0,
        paidOrderCount: Number(r?.paidOrderCount ?? 0)
      });
    }
    this.writeCache(cacheKey, result);
    return result;
  }

  async getDistribution(dim: GmvDistributionDim, limit: number, force = false): Promise<GmvDistributionRow[]> {
    const cacheKey = `gmvDist:${dim}:${limit}`;
    if (!force) {
      const cached = this.readCache<GmvDistributionRow[]>(cacheKey);
      if (cached) return cached;
    } else {
      this.cache.delete(cacheKey);
    }

    // 优先:OrderHeader 按 merchantName 聚合(JeSite ETL 真实订单)
    // JeSite 没区域字段,所以 area/category/channel 都用 merchantName 做维度替代
    const ohRows = await this.computeDistributionFromOrderHeader(dim, limit);
    if (ohRows.length > 0) {
      this.writeCache(cacheKey, ohRows);
      return ohRows;
    }

    // 回退:SalesSnapshot JOIN ContentPackage (老数据,通常空)
    const today = beijingDateKey(new Date());
    let rows: Array<{ key: string; gmv: number; gmvOnline: number; gmvWallet: number; gmvBonus: number }> = [];

    if (dim === 'area') {
      rows = (await this.prisma.$queryRawUnsafe(
        `
          SELECT cp."areaName" AS "key",
                 COALESCE(SUM(ss."paidAmountOnline" + ss."paidAmountWallet"), 0) AS "gmv",
                 COALESCE(SUM(ss."paidAmountOnline"), 0) AS "gmvOnline",
                 COALESCE(SUM(ss."paidAmountWallet"), 0) AS "gmvWallet",
                 COALESCE(SUM(ss."paidAmountBonus"), 0) AS "gmvBonus"
          FROM "SalesSnapshot" ss
          JOIN "ContentPackage" cp ON cp."packageId" = ss."packageId"
          WHERE cp."areaName" IS NOT NULL AND cp."areaName" <> ''
          GROUP BY cp."areaName"
          ORDER BY "gmv" DESC
          LIMIT ?
        `,
        limit
      )) as Array<typeof rows[number]>;
    } else if (dim === 'category') {
      rows = (await this.prisma.$queryRawUnsafe(
        `
          SELECT cp."category" AS "key",
                 COALESCE(SUM(ss."paidAmountOnline" + ss."paidAmountWallet"), 0) AS "gmv",
                 COALESCE(SUM(ss."paidAmountOnline"), 0) AS "gmvOnline",
                 COALESCE(SUM(ss."paidAmountWallet"), 0) AS "gmvWallet",
                 COALESCE(SUM(ss."paidAmountBonus"), 0) AS "gmvBonus"
          FROM "SalesSnapshot" ss
          JOIN "ContentPackage" cp ON cp."packageId" = ss."packageId"
          WHERE cp."category" IS NOT NULL AND cp."category" <> ''
          GROUP BY cp."category"
          ORDER BY "gmv" DESC
          LIMIT ?
        `,
        limit
      )) as Array<typeof rows[number]>;
    } else {
      // channel: JeSite 无渠道,统一标 "jeesite-direct"
      rows = (await this.prisma.$queryRawUnsafe(
        `
          SELECT 'jeesite-direct' AS "key",
                 COALESCE(SUM("paidAmountOnline" + "paidAmountWallet"), 0) AS "gmv",
                 COALESCE(SUM("paidAmountOnline"), 0) AS "gmvOnline",
                 COALESCE(SUM("paidAmountWallet"), 0) AS "gmvWallet",
                 COALESCE(SUM("paidAmountBonus"), 0) AS "gmvBonus"
          FROM "SalesSnapshot"
        `
      )) as Array<typeof rows[number]>;
    }

    const totalGmv = rows.reduce((s, r) => s + Number(r.gmv), 0);
    const result: GmvDistributionRow[] = rows.map((r) => ({
      key: String(r.key),
      totalGmv: Number(r.gmv),
      gmvOnline: Number(r.gmvOnline),
      gmvWallet: Number(r.gmvWallet),
      gmvBonus: Number(r.gmvBonus),
      share: totalGmv > 0 ? Number(r.gmv) / totalGmv : 0
    }));
    this.writeCache(cacheKey, result);
    return result;
  }

  /** OrderHeader 按 merchantName 分组(JeSite 没区域字段,统一用商家做维度) */
  private async computeDistributionFromOrderHeader(_dim: string, limit: number): Promise<GmvDistributionRow[]> {
    // 最近 7 天 Beijing 窗口,保证分布有数据
    const todayStr = beijingDateKey(new Date());
    const weekAgoStr = beijingDateKey(Date.now() - 6 * 86400000);
    const weekStart = beijingDayRangeUtc(weekAgoStr).start;
    const todayEnd = beijingDayRangeUtc(todayStr).end;

    const rows = await this.prisma.orderHeader.findMany({
      where: {
        paidTime: { gte: weekStart, lt: todayEnd },
        status: { in: ['paid', 'verified'] },
        merchantName: { not: null }
      },
      select: { merchantName: true, paidAmount: true, paidAmountWallet: true, paidAmountBonus: true }
    });

    type Bucket = { gmv: number; online: number; wallet: number; bonus: number };
    const buckets = new Map<string, Bucket>();
    for (const r of rows) {
      const k = r.merchantName || '(未知)';
      const b = buckets.get(k) ?? { gmv: 0, online: 0, wallet: 0, bonus: 0 };
      b.online += Number(r.paidAmount);
      b.wallet += Number(r.paidAmountWallet);
      b.bonus += Number(r.paidAmountBonus);
      b.gmv = b.online + b.wallet;
      buckets.set(k, b);
    }

    const sorted = Array.from(buckets.entries())
      .sort((a, b) => b[1].gmv - a[1].gmv)
      .slice(0, limit);

    const totalGmv = sorted.reduce((s, [, b]) => s + b.gmv, 0);
    return sorted.map(([k, b]) => ({
      key: k,
      totalGmv: b.gmv,
      gmvOnline: b.online,
      gmvWallet: b.wallet,
      gmvBonus: b.bonus,
      share: totalGmv > 0 ? b.gmv / totalGmv : 0
    }));
  }

  async getTopMerchants(
    sortBy: GmvMerchantSort,
    page: number,
    pageSize: number,
    force = false
  ): Promise<{ items: GmvMerchantRow[]; hasMore: boolean }> {
    const cacheKey = `gmvMerchants:${sortBy}:${page}:${pageSize}`;
    if (!force) {
      const cached = this.readCache<{ items: GmvMerchantRow[]; hasMore: boolean }>(cacheKey);
      if (cached) return cached;
    } else {
      this.cache.delete(cacheKey);
    }

    const orderBy = (() => {
      switch (sortBy) {
        case 'refundDesc':
          return 'gmvRefund DESC';
        case 'verifyDesc':
          return 'gmvVerify DESC';
        case 'gmvDesc':
        default:
          return 'gmv DESC';
      }
    })();

    const offset = (page - 1) * pageSize;
    // 优先:OrderHeader 按 merchantId + merchantName 聚合(JeSite ETL 真实订单)
    const ohMerchants = await this.computeMerchantsFromOrderHeader();
    if (ohMerchants.length > 0) {
      // 排序
      ohMerchants.sort((a, b) => {
        if (sortBy === 'refundDesc') return b.gmvRefund - a.gmvRefund || a.merchantName.localeCompare(b.merchantName);
        if (sortBy === 'verifyDesc') return b.gmvVerify - a.gmvVerify || a.merchantName.localeCompare(b.merchantName);
        return b.gmv - a.gmv || a.merchantName.localeCompare(b.merchantName);
      });
      const paged = ohMerchants.slice(offset, offset + pageSize);
      const result = { items: paged, hasMore: paged.length === pageSize && ohMerchants.length > offset + pageSize };
      this.writeCache(cacheKey, result);
      return result;
    }

    // 回退:SalesSnapshot + ContentPackage(老数据,通常空)
    const allSnapshots = await this.prisma.salesSnapshot.findMany({
      select: { merchantId: true, paidAmount: true, refundAmount: true, paidOrderCount: true }
    });
    type AggregateBucket = { gmv: number; refund: number; verify: number; paid: number };
    const buckets = new Map<string, AggregateBucket>();
    for (const s of allSnapshots) {
      if (!s.merchantId) continue;
      const b = buckets.get(s.merchantId) ?? { gmv: 0, refund: 0, verify: 0, paid: 0 };
      b.gmv += Number(s.paidAmount);
      b.refund += Number(s.refundAmount);
      b.verify += Number(s.refundAmount);
      b.paid += Number(s.paidOrderCount);
      buckets.set(s.merchantId, b);
    }

    // 拿商家名 (用一次性 distinct query) — 数据量小,可全表
    const merchants = (await this.prisma.contentPackage.findMany({
      where: { merchantId: { not: '' } },
      select: { merchantId: true, merchantName: true, areaName: true }
    })) as Array<{ merchantId: string; merchantName: string; areaName: string | null }>;
    const seen = new Set<string>();
    const metaMap = new Map<string, { merchantName: string; areaName: string | null }>();
    for (const m of merchants) {
      if (seen.has(m.merchantId)) continue;
      seen.add(m.merchantId);
      metaMap.set(m.merchantId, { merchantName: m.merchantName, areaName: m.areaName });
    }

    type AggregateRow = {
      merchantId: string;
      gmv: number;
      gmvRefund: number;
      gmvVerify: number;
      paidOrderCount: number;
    };

    const itemsAll: AggregateRow[] = Array.from(buckets.entries()).map(([merchantId, b]) => ({
      merchantId,
      gmv: b.gmv,
      gmvRefund: b.refund,
      gmvVerify: b.verify,
      paidOrderCount: b.paid
    }));

    // 排序
    itemsAll.sort((a, b) => {
      if (sortBy === 'refundDesc') return b.gmvRefund - a.gmvRefund || a.merchantId.localeCompare(b.merchantId);
      if (sortBy === 'verifyDesc') return b.gmvVerify - a.gmvVerify || a.merchantId.localeCompare(b.merchantId);
      return b.gmv - a.gmv || a.merchantId.localeCompare(b.merchantId);
    });

    const paged = itemsAll.slice(offset, offset + pageSize);
    const items: GmvMerchantRow[] = paged.map((r) => {
      const meta = metaMap.get(r.merchantId);
      return {
        merchantId: r.merchantId,
        merchantName: meta?.merchantName ?? r.merchantId,
        areaName: meta?.areaName ?? null,
        gmv: r.gmv,
        gmvRefund: r.gmvRefund,
        gmvVerify: r.gmvVerify,
        refundRate: r.gmv > 0 ? r.gmvRefund / r.gmv : 0,
        verifyRate: r.gmv > 0 ? r.gmvVerify / r.gmv : 0,
        paidOrderCount: r.paidOrderCount
      };
    });

    const result = { items, hasMore: items.length === pageSize };
    this.writeCache(cacheKey, result);
    return result;
  }

  // -------- helpers --------

  /** OrderHeader 按 merchantId + merchantName 分组聚合（按 Beijing 当天订单,7 天窗口）。
   *  优先于 SalesSnapshot,因为 JeSite ETL 的真实订单在 OrderHeader 里。 */
  private async computeMerchantsFromOrderHeader(): Promise<GmvMerchantRow[]> {
    const todayStr = beijingDateKey(new Date());
    const weekAgoStr = beijingDateKey(Date.now() - 6 * 86400000);
    const weekStart = beijingDayRangeUtc(weekAgoStr).start;
    const todayEnd = beijingDayRangeUtc(todayStr).end;

    const rows = await this.prisma.orderHeader.findMany({
      where: {
        paidTime: { gte: weekStart, lt: todayEnd },
        status: { in: ['paid', 'verified'] },
        merchantId: { not: null }
      },
      select: {
        merchantId: true,
        merchantName: true,
        paidAmount: true,
        paidAmountWallet: true,
        paidAmountBonus: true,
        refundAmount: true,
        verifyAmount: true
      }
    });

    type Bucket = { gmv: number; refund: number; verify: number; paid: number; merchantIds: Set<string> };
    const buckets = new Map<string, Bucket>();
    for (const r of rows) {
      const key = r.merchantName && r.merchantName.length > 0 ? r.merchantName : r.merchantId!;
      const b = buckets.get(key) ?? { gmv: 0, refund: 0, verify: 0, paid: 0, merchantIds: new Set() };
      b.gmv += Number(r.paidAmount) + Number(r.paidAmountWallet);
      b.refund += Number(r.refundAmount);
      b.verify += Number(r.verifyAmount);
      b.paid += 1;
      b.merchantIds.add(r.merchantId!);
      buckets.set(key, b);
    }

    return Array.from(buckets.entries()).map(([key, b]) => ({
      merchantId: Array.from(b.merchantIds)[0] ?? key,
      merchantName: key,
      areaName: null,
      gmv: b.gmv,
      gmvRefund: b.refund,
      gmvVerify: b.verify,
      refundRate: b.gmv > 0 ? b.refund / b.gmv : 0,
      verifyRate: b.gmv > 0 ? b.verify / b.gmv : 0,
      paidOrderCount: b.paid
    }));
  }

  /** OrderHeader 按日(Beijing 当天)聚合趋势;返回长度 = days 的数组,空日期填 0 */
  private async computeTrendFromOrderHeader(startDate: string, endDate: string): Promise<GmvTrendPoint[]> {
    const { start: dayStart } = beijingDayRangeUtc(startDate);
    const { end: dayEnd } = beijingDayRangeUtc(endDate);

    const rows = await this.prisma.orderHeader.findMany({
      where: {
        paidTime: { gte: dayStart, lt: dayEnd },
        status: { in: ['paid', 'verified'] }
      },
      select: {
        orderTime: true,
        paidAmount: true,
        paidAmountWallet: true,
        paidAmountBonus: true,
        refundAmount: true,
        verifyAmount: true
      }
    });

    // 用 Beijing 当天分桶:orderTime 是 UTC ISO,推 UTC 毫秒 + 8h 得到 Beijing 当时,
    // 再 .toISOString().slice(0,10) 拿到 Beijing 日期。
    type Bucket = { online: number; wallet: number; bonus: number; refund: number; verify: number; count: number };
    const buckets = new Map<string, Bucket>();
    for (const r of rows) {
      const bjMs = r.orderTime.getTime() + 8 * 3600 * 1000;
      const bjDate = new Date(bjMs).toISOString().slice(0, 10);
      const b = buckets.get(bjDate) ?? { online: 0, wallet: 0, bonus: 0, refund: 0, verify: 0, count: 0 };
      b.online += Number(r.paidAmount);
      b.wallet += Number(r.paidAmountWallet);
      b.bonus += Number(r.paidAmountBonus);
      b.refund += Number(r.refundAmount);
      b.verify += Number(r.verifyAmount);
      b.count += 1;
      buckets.set(bjDate, b);
    }

    const empty: GmvTrendPoint = {
      date: '', totalGmv: 0, gmvOnline: 0, gmvWallet: 0, gmvBonus: 0,
      totalRefund: 0, refundRate: 0, verifyRate: 0, paidOrderCount: 0
    };
    const result: GmvTrendPoint[] = [];
    const days = this.shiftDate(endDate, -(this.countDays(startDate, endDate) - 1));
    for (let i = 0; i < this.countDays(startDate, endDate); i++) {
      const d = this.shiftDate(startDate, i);
      const b = buckets.get(d);
      if (!b) { result.push({ ...empty, date: d }); continue; }
      const gmv = b.online + b.wallet; // 在线 + 余额 (积分不计)
      result.push({
        date: d,
        totalGmv: gmv,
        gmvOnline: b.online,
        gmvWallet: b.wallet,
        gmvBonus: b.bonus,
        totalRefund: b.refund,
        refundRate: gmv > 0 ? b.refund / gmv : 0,
        verifyRate: gmv > 0 ? b.verify / gmv : 0,
        paidOrderCount: b.count
      });
    }
    return result;
  }

  private countDays(startDate: string, endDate: string): number {
    // 用 shiftDate 纯日历计算:推进 (endDate → startDate) 用了多少天 + 1。
    let count = 0;
    let cursor = startDate;
    while (cursor < endDate) {
      cursor = this.shiftDate(cursor, 1);
      count++;
      if (count > 366) return 366; // 防御性上限,避免意外死循环
    }
    return count + 1;
  }

  private async computeFromOrderHeader(date: string): Promise<GmvTodayPayload> {
    // 用 +08:00 解析日期字串得到当天的 UTC 时间范围。按 paidTime 聚合（跟 JeSite payDate 口径一致）。
    const { start: dayStart, end: dayEnd } = beijingDayRangeUtc(date);
    const rows = await this.prisma.orderHeader.findMany({
      where: {
        paidTime: { gte: dayStart, lt: dayEnd },
        status: { in: ['paid', 'verified'] }
      },
      select: {
        orderTime: true,
        paidAmount: true,
        paidAmountWallet: true,
        paidAmountBonus: true,
        paidAmountCard: true,
        refundAmount: true,
        verifyAmount: true
      }
    });

    let online = 0, wallet = 0, bonus = 0, card = 0, refund = 0, verify = 0;
    for (const r of rows) {
      online += Number(r.paidAmount);
      wallet += Number(r.paidAmountWallet);
      bonus += Number(r.paidAmountBonus);
      card += Number(r.paidAmountCard);
      refund += Number(r.refundAmount);
      verify += Number(r.verifyAmount);
    }
    const totalGmv = online + wallet; // 披露口径:在线现金 + 余额支付 (积分抵现不计)
    return {
      date,
      totalGmv,
      gmvOnline: online,
      gmvWallet: wallet,
      gmvBonus: bonus, // 单独披露,不计入 GMV
      gmvCard: card,
      totalRefund: refund,
      refundRate: totalGmv > 0 ? refund / totalGmv : 0,
      totalVerify: verify,
      verifyRate: totalGmv > 0 ? verify / totalGmv : 0,
      paidOrderCount: rows.length,
      paidAmountBonus: bonus,
      paidAmountWallet: wallet,
      updatedAt: new Date().toISOString(),
      dataSource: 'OrderHeader'
    };
  }

  private async computeFromSalesSnapshot(date: string): Promise<GmvTodayPayload> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          date(datetime("snapshotTime" / 1000, 'unixepoch')) AS "date",
          COALESCE(SUM("paidAmountOnline"), 0) AS "gmvOnline",
          COALESCE(SUM("paidAmountWallet"), 0) AS "gmvWallet",
          COALESCE(SUM("paidAmountBonus"), 0) AS "gmvBonus",
          COALESCE(SUM("paidAmountCard"), 0) AS "gmvCard",
          COALESCE(SUM("refundAmount"), 0) AS "refund",
          COALESCE(SUM("verifyAmount"), 0) AS "verify",
          COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount"
        FROM "SalesSnapshot"
        WHERE date(datetime("snapshotTime" / 1000, 'unixepoch')) = ?
        GROUP BY date(datetime("snapshotTime" / 1000, 'unixepoch'))
      `,
      date
    )) as Array<{
      date: string;
      gmvOnline: number;
      gmvWallet: number;
      gmvBonus: number;
      gmvCard: number;
      refund: number;
      verify: number;
      paidOrderCount: number;
    }>;

    const r = rows[0];
    if (!r) {
      return {
        date,
        totalGmv: 0,
        gmvOnline: 0,
        gmvWallet: 0,
        gmvBonus: 0,
        gmvCard: 0,
        totalRefund: 0,
        refundRate: 0,
        totalVerify: 0,
        verifyRate: 0,
        paidOrderCount: 0,
        paidAmountBonus: 0,
        paidAmountWallet: 0,
        updatedAt: new Date().toISOString(),
        dataSource: 'SalesSnapshot'
      };
    }

    const gmvOnline = Number(r.gmvOnline);
    const gmvWallet = Number(r.gmvWallet);
    const gmvBonus = Number(r.gmvBonus);
    const gmvCard = Number(r.gmvCard);
    const totalGmv = gmvOnline + gmvWallet; // 披露口径:在线现金 + 余额支付 (积分抵现不计)
    const totalRefund = Number(r.refund);
    const totalVerify = Number(r.verify);
    return {
      date: r.date,
      totalGmv,
      gmvOnline,
      gmvWallet,
      gmvBonus,
      gmvCard,
      totalRefund,
      refundRate: totalGmv > 0 ? totalRefund / totalGmv : 0,
      totalVerify,
      verifyRate: totalGmv > 0 ? totalVerify / totalGmv : 0,
      paidOrderCount: Number(r.paidOrderCount),
      paidAmountBonus: gmvBonus,
      paidAmountWallet: gmvWallet,
      updatedAt: new Date().toISOString(),
      dataSource: 'SalesSnapshot'
    };
  }

  private shiftDate(yyyyMmDd: string, deltaDays: number): string {
    // 用 Date.UTC 在时间轴上推进 N 天,不经过时区。返回的仍是 YYYY-MM-DD 字符串字面推进。
    const [y, m, d] = yyyyMmDd.split('-').map(Number);
    const t = Date.UTC(y, m - 1, d) + deltaDays * 86400000;
    const shifted = new Date(t);
    const y2 = shifted.getUTCFullYear();
    const m2 = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const d2 = String(shifted.getUTCDate()).padStart(2, '0');
    return `${y2}-${m2}-${d2}`;
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

  invalidateCache(prefix?: string) {
    if (!prefix) {
      this.cache.clear();
      return;
    }
    for (const k of this.cache.keys()) {
      if (k.startsWith(prefix)) this.cache.delete(k);
    }
  }

  /** 从 JeSite listData 拉指定日期窗口的订单 upsert 到 OrderHeader,然后失效 GMV 缓存。
   *  返回 { date, fetched, upserted, skipped, errors }
   *  cookie 优先用 AutoLoginService(自动续期),失败回退到 env 直读。
   */
  async refreshFromJeesite(startDate: string, endDate: string): Promise<{
    startDate: string;
    endDate: string;
    fetched: number;
    upserted: number;
    skipped: number;
    errors: number;
    pagesFetched: number;
  }> {
    const baseUrl = process.env.EXTERNAL_API_BASE_URL;
    if (!baseUrl) throw new Error('EXTERNAL_API_BASE_URL 未配置');

    // 优先复用 AutoLoginService 已验证的 Cookie；只有订单接口确认会话失效时才强制续期。
    let cookieHeader: string | null = null;
    if (this.autoLogin) {
      try {
        cookieHeader = await this.autoLogin.ensureValidCookie();
      } catch (e) {
        this.logger.warn(`AutoLogin 失败,降级到 env cookie: ${(e as Error).message}`);
      }
    }
    if (!cookieHeader) {
      const envCookie =
        process.env.JEESITE_SESSION_ID ??
        process.env.JEESITE_COOKIE ??
        process.env.EXTERNAL_API_COOKIE ??
        '';
      if (!envCookie) throw new Error('没有可用的 JeSite cookie (env 也没配)');
      cookieHeader = envCookie.includes('=') ? envCookie : `jeesite.session.id=${envCookie}`;
    }

    const PAGE_SIZE = 50;
    const MAX_PAGES = Number(process.env.ETL_MAX_PAGES ?? '30');

    let pageNo = 1;
    let fetched = 0, upserted = 0, skipped = 0, errors = 0;
    for (let i = 0; i < MAX_PAGES; i++) {
      const url = new URL(`${baseUrl.replace(/\/$/, '')}/bargain/bargainOrder/listData`);
      url.searchParams.set('pageNo', String(pageNo));
      url.searchParams.set('pageSize', String(PAGE_SIZE));
      url.searchParams.set('screeningStartPayDate', `${startDate} 00:00:00`);
      url.searchParams.set('screeningEndPayDate', `${endDate} 23:59:59`);

      const fetchPage = async (cookie: string) => {
        const res = await fetch(url.toString(), {
          headers: { Cookie: cookie, 'x-ajax': 'json', Accept: 'application/json' },
          redirect: 'manual'
        });
        if (!res.ok) throw new Error(`JeSite HTTP ${res.status}: ${await res.text()}`);
        const rawText = await res.text();
        if (rawText.trimStart().startsWith('<')) return null;
        try {
          const parsed = JSON.parse(rawText) as unknown;
          if (isRecord(parsed) && parsed.result === 'login') return null;
          return parsed;
        } catch {
          return null;
        }
      };

      let payload = await fetchPage(cookieHeader ?? '');
      if (!payload && this.autoLogin) {
        this.logger.warn('JeeSite session expired during GMV refresh, renewing once');
        this.autoLogin.clearCache();
        cookieHeader = await this.autoLogin.ensureValidCookie(true);
        if (cookieHeader) payload = await fetchPage(cookieHeader);
      }
      if (!isRecord(payload)) {
        throw new Error(
          'JeeSite login expired and automatic renewal failed; check EXTERNAL_API_USERNAME/PASSWORD'
        );
      }
      const rows = payload.list ?? payload.rows ?? [];
      if (!Array.isArray(rows)) throw new Error('JeSite order API returned an invalid payload');
      if (rows.length === 0) break;
      fetched += rows.length;

      // 用 jeesite-bargain-adapter 的映射函数 — 保持和 ETL 脚本一致
      const { mapJeesiteOrderListToDataset } = await import('../content/jeesite-bargain-adapter');
      const { orders } = mapJeesiteOrderListToDataset(payload);
      for (const o of orders) {
        if (!o.orderId) { skipped++; continue; }
        try {
          await this.prisma.orderHeader.upsert({
            where: { orderId: o.orderId },
            create: {
              orderId: o.orderId,
              memberId: o.memberId || null,
              packageId: o.packageId || null,
              merchantId: o.merchantId || null,
              merchantName: o.merchantName || null,
              areaId: o.areaId || null,
              areaName: o.areaName || null,
              orderTime: new Date(o.orderTime),
              paidTime: o.paidTime ? new Date(o.paidTime) : null,
              verifyTime: o.verifyTime ? new Date(o.verifyTime) : null,
              refundTime: o.refundTime ? new Date(o.refundTime) : null,
              orderAmount: o.orderAmount,
              paidAmount: o.paidAmount,
              paidAmountWallet: o.paidAmountWallet,
              paidAmountBonus: o.paidAmountBonus,
              paidAmountCard: 0,
              refundAmount: o.refundAmount ?? 0,
              verifyAmount: o.verifyAmount ?? 0,
              pointEarned: o.pointEarned,
              pointUsed: o.pointUsed,
              status: o.status,
              channel: 'jeesite'
            },
            update: {
              memberId: o.memberId || null,
              packageId: o.packageId || null,
              merchantId: o.merchantId || null,
              merchantName: o.merchantName || null,
              areaId: o.areaId || null,
              areaName: o.areaName || null,
              orderTime: new Date(o.orderTime),
              paidTime: o.paidTime ? new Date(o.paidTime) : null,
              verifyTime: o.verifyTime ? new Date(o.verifyTime) : null,
              refundTime: o.refundTime ? new Date(o.refundTime) : null,
              orderAmount: o.orderAmount,
              paidAmount: o.paidAmount,
              paidAmountWallet: o.paidAmountWallet,
              paidAmountBonus: o.paidAmountBonus,
              refundAmount: o.refundAmount ?? 0,
              verifyAmount: o.verifyAmount ?? 0,
              status: o.status
            }
          });
          upserted++;
        } catch (e) {
          errors++;
          this.logger.warn(`upsert ${o.orderId} 失败: ${(e as Error).message}`);
        }
      }
      if (rows.length < PAGE_SIZE) break;
      pageNo++;
    }

    // ETL 完成后清掉 GMV 缓存,下次 query 强制重算
    this.invalidateCache();

    // 同步触发商家销售数据(日聚合)重算。失败仅 log,不影响 GMV 刷新响应。
    try {
      const merchantSales = await this.getMerchantSalesService();
      if (merchantSales) {
        await merchantSales.recomputeRange(startDate, endDate);
      }
    } catch (e) {
      this.logger.warn(
        `merchant-sales recomputeRange failed: ${(e as Error).message}`
      );
    }

    this.logger.log(
      `JeSite refresh [${startDate} → ${endDate}] pages=${pageNo} fetched=${fetched} upserted=${upserted} errors=${errors}`
    );
    return { startDate, endDate, fetched, upserted, skipped, errors, pagesFetched: pageNo };
  }

  /** Dev-only probe — 临时恢复 */
  async probeRefundEndpoint(path: string) {
    if (!this.autoLogin) {
      return { ok: false, note: 'autoLogin missing' };
    }
    const cookieHeader = await this.autoLogin.ensureValidCookie(true);
    const baseUrl = process.env.EXTERNAL_API_BASE_URL;
    if (!baseUrl) return { ok: false, note: 'EXTERNAL_API_BASE_URL missing' };
    const url = new URL(`${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`);
    try {
      const res = await fetch(url.toString(), {
        headers: { Cookie: cookieHeader ?? '', 'x-ajax': 'json', Accept: 'application/json' }
      });
      const ct = res.headers.get('content-type');
      const text = await res.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text.slice(0, 1000);
      }
      return { ok: true, status: res.status, contentType: ct, payload, note: `URL=${url.toString()}` };
    } catch (e) {
      return { ok: false, note: `err ${(e as Error).message}` };
    }
  }
}
