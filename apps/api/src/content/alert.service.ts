import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AlertQuery, OperationAlert, RecommendPackageItem } from '@content/shared';
import { ALERT_TYPES, resolvePagination, beijingDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { RecommendQuery, RecommendationResult } from './content.service';
import { safePathId } from '../common/path-id';
import { toSqliteDateTime } from '../common/sqlite-datetime';
import { TtlCache } from '../common';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../common/heavy-aggregate-gate';
import { RECOMMEND_CACHE_CAP, RESOLVED_ALERT_DAY_LIMIT } from '../common/sql-chunk';

type GetRecommendationsFn = (q: RecommendQuery) => Promise<RecommendationResult>;

const ALERT_TYPE_SET = new Set<string>(ALERT_TYPES);

/** Ranked alert aggregate is recomputed from full recommend catalog — cache across page flips. */
const ALERT_AGGREGATE_TTL_MS = 60_000;

export type AlertScope = {
  areaId?: string;
  merchantId?: string;
  areaIds?: string[];
  merchantIds?: string[];
};

/** Aggregate cache key — page/pageSize/level/type/keyword intentionally excluded. */
export function alertAggregateCacheKey(
  query: Pick<AlertQuery, 'role' | 'date'>,
  scope: AlertScope = {},
  today: string
): string {
  const areaIds = [...(scope.areaIds ?? [])].sort().join(',');
  const merchantIds = [...(scope.merchantIds ?? [])].sort().join(',');
  return [
    'alerts:aggregate',
    query.date ?? today,
    query.role ?? '',
    scope.areaId ?? '',
    scope.merchantId ?? '',
    areaIds,
    merchantIds
  ].join('|');
}

/** Flatten + rank operation alerts from a recommend payload (no resolve filter). */
export function extractRankedAlerts(
  packages: Array<Pick<RecommendPackageItem, 'operationAlerts'>>,
  rank: (alerts: OperationAlert[]) => OperationAlert[]
): OperationAlert[] {
  return rank(packages.flatMap((pkg) => pkg.operationAlerts ?? []));
}

// 合并了 resolveOperationAlert / resolveOperationAlerts 中重复的 SQL 字符串
const ALERT_UPSERT_SQL = `
  INSERT INTO "OperationAlertResolution" ("alertId", "resolvedDate", "resolvedBy", "resolvedAt")
  VALUES (?, ?, ?, ?)
  ON CONFLICT("alertId", "resolvedDate") DO UPDATE SET
    "resolvedBy" = excluded."resolvedBy",
    "resolvedAt" = excluded."resolvedAt"`;

// alert 优先级权重
// - ALERT_LEVEL_WEIGHTS 反映业务严重度:danger > warning > info
// - ALERT_TYPE_WEIGHTS 反映 9 种预警类型的影响排序
// 数值被 alert.service.spec.ts 的 score 断言锁死(80/52/20/18/...),
// 修改需同步更新测试。
const ALERT_LEVEL_WEIGHTS: Readonly<Record<OperationAlert['level'], number>> = {
  danger: 80,
  warning: 52,
  info: 20
};
const ALERT_TYPE_WEIGHTS: Readonly<Partial<Record<OperationAlert['type'], number>>> = {
  high_refund: 20,
  continuous_unsold: 18,
  inventory_abnormal: 17,
  price_abnormal: 16,
  abnormal_sold_out: 14,
  low_verify: 12,
  merchant_abnormal: 10,
  missing_use_rules: 8,
  missing_selling_points: 4
};

@Injectable()
export class AlertService {
  /** Ranked alert lists are fat (package card fields × many keys) — lower maxSize. */
  private readonly aggregateCache = new TtlCache(ALERT_AGGREGATE_TTL_MS, HEAVY_LIST_CACHE_MAX_SIZE);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * 从 ContentService 注入推荐结果，避免循环依赖。
   * 通过方法参数传入推荐结果而非构造函数注入。
   *
   * Ranked alerts are cached without page/filter so page flips only re-slice.
   * Resolved-id set is loaded every request (cheap) so resolve stays immediate.
   */
  async getOperationAlerts(
    query: AlertQuery,
    getRecommendations: GetRecommendationsFn,
    scope: AlertScope = {}
  ) {
    const today = this.todayKey();
    const cacheKey = alertAggregateCacheKey(query, scope, today);
    // Load ranked aggregate + resolved set in parallel on cold path; warm path
    // still parallelizes resolved-id fetch with the (instant) cache hit.
    // Residual #275: cache ranked alerts + recommend source-cap honesty together so
    // warm page flips still surface RECOMMEND_CACHE_CAP incompleteness.
    type AlertAggregatePayload = {
      alerts: OperationAlert[];
      sourceMatchedCount: number;
      sourceLimit: number;
      sourceTruncated: boolean;
    };
    const [aggregate, resolvedMeta] = await Promise.all([
      this.aggregateCache.getOrLoad<AlertAggregatePayload>(cacheKey, false, async () => {
        const recommendations = await getRecommendations({
          role: query.role,
          status: 'selling',
          date: query.date
        });
        const packages = recommendations.packages ?? [];
        const sourceLimit = RECOMMEND_CACHE_CAP;
        const sourceMatchedCount =
          typeof recommendations.matchedCount === 'number' &&
          Number.isFinite(recommendations.matchedCount)
            ? Math.max(0, Math.floor(recommendations.matchedCount))
            : packages.length;
        return {
          alerts: extractRankedAlerts(packages, (alerts) => this.rankAlerts(alerts)),
          sourceMatchedCount,
          sourceLimit,
          sourceTruncated: sourceMatchedCount > packages.length
        };
      }),
      this.loadResolvedAlertIds(today)
    ]);
    const allAlerts = aggregate.alerts;
    // resolvedDate 与 resolve* 写入保持一致:当天 beijingDateKey(now),
    // 而不是 recommendations.date(回填/历史日期会让已处理记录查不到)。
    const resolvedAlertIds = resolvedMeta.ids;
    const activeAlerts = allAlerts.filter((alert) => !resolvedAlertIds.has(alert.alertId));
    const filteredAlerts = this.filterAlerts(activeAlerts, query);
    const pagination = this.resolvePagination(query.page, query.pageSize, filteredAlerts.length);
    return {
      items: filteredAlerts.slice(pagination.offset, pagination.offset + pagination.pageSize),
      summary: this.buildAlertSummary(allAlerts, activeAlerts),
      // Residual #283: Top-N focus package head honesty (distinct packages with active alerts).
      ...(() => {
        const focus = this.buildAlertPackageFocus(activeAlerts);
        return {
          topPackages: focus.items,
          focusPackageLimit: focus.limit,
          focusPackageMatched: focus.matched,
          focusPackageTruncated: focus.truncated
        };
      })(),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: filteredAlerts.length,
        totalPages: Math.max(1, Math.ceil(filteredAlerts.length / pagination.pageSize))
      },
      // Residual #274: RESOLVED_ALERT_DAY_LIMIT honesty (silent clip → false "active").
      resolvedIdsLimit: resolvedMeta.limit,
      resolvedIdsLoaded: resolvedMeta.loaded,
      resolvedIdsTruncated: resolvedMeta.truncated,
      // Residual #275: RECOMMEND_CACHE_CAP source-cap honesty (alerts from capped head).
      sourceMatchedCount: aggregate.sourceMatchedCount,
      sourceLimit: aggregate.sourceLimit,
      sourceTruncated: aggregate.sourceTruncated
    };
  }

  /** Drop ranked-alert aggregate after catalog refresh (resolved rows are not cached). */
  invalidateAggregateCache(prefix?: string) {
    this.aggregateCache.clear(prefix);
  }

  async resolveOperationAlert(alertId: string, resolvedBy = 'operator') {
    const normalized = this.normalizeAlertId(alertId);
    const resolvedDate = this.todayKey();
    await this.upsertResolution(normalized, resolvedDate, resolvedBy);
    return { success: true, alertId: normalized, resolvedDate, message: '预警已标记为已处理' };
  }

  async resolveOperationAlerts(alertIds: string[], resolvedBy = 'operator') {
    // Defense-in-depth: DTO ArrayMaxSize(200); still clamp if called internally.
    const RESOLVE_BATCH_MAX = 200;
    const uniqueAlertIds = [
      ...new Set(
        (alertIds ?? [])
          .map((id) => {
            try {
              return this.normalizeAlertId(id);
            } catch {
              return '';
            }
          })
          .filter(Boolean)
      )
    ].slice(0, RESOLVE_BATCH_MAX);
    if (!uniqueAlertIds.length) throw new BadRequestException('alertIds 不能为空或格式无效');
    const resolvedDate = this.todayKey();
    // Residual #97: multi-row INSERT … ON CONFLICT (not N serial upserts under TX).
    // 4 cols × 50 = 200 params; still atomic via interactive $transaction.
    const RESOLVE_INSERT_CHUNK = 50;
    const resolvedAt = toSqliteDateTime();
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < uniqueAlertIds.length; i += RESOLVE_INSERT_CHUNK) {
        const slice = uniqueAlertIds.slice(i, i + RESOLVE_INSERT_CHUNK);
        const valueClauses = slice.map(() => '(?, ?, ?, ?)').join(', ');
        const params: unknown[] = [];
        for (const alertId of slice) {
          params.push(alertId, resolvedDate, resolvedBy, resolvedAt);
        }
        await tx.$executeRawUnsafe(
          `INSERT INTO "OperationAlertResolution" ("alertId", "resolvedDate", "resolvedBy", "resolvedAt")
           VALUES ${valueClauses}
           ON CONFLICT("alertId", "resolvedDate") DO UPDATE SET
             "resolvedBy" = excluded."resolvedBy",
             "resolvedAt" = excluded."resolvedAt"`,
          ...params
        );
      }
    });
    return {
      success: true,
      alertIds: uniqueAlertIds,
      resolvedCount: uniqueAlertIds.length,
      resolvedDate,
      message: '预警已标记为已处理'
    };
  }

  /**
   * alertId shape is `${packageId}:${type}` (see domain/operation-tags).
   * Reject free-form ids so resolution table cannot be polluted with garbage keys.
   */
  private normalizeAlertId(raw: string): string {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) throw new BadRequestException('alertId 必填');
    const sep = value.lastIndexOf(':');
    if (sep <= 0 || sep === value.length - 1) {
      throw new BadRequestException('alertId 格式无效，期望 packageId:type');
    }
    const packageId = safePathId(value.slice(0, sep));
    const type = value.slice(sep + 1).trim();
    if (!packageId || !ALERT_TYPE_SET.has(type)) {
      throw new BadRequestException('alertId 格式无效，期望 packageId:type');
    }
    return `${packageId}:${type}`;
  }

  /**
   * 返回 OperationAlertResolution upsert 的 Prisma client promise。
   * 注意:`return` 必须直接返回 `prisma.X.upsert(...)` 的引用,不要 await,
   * Prisma 6 的 `$transaction` 会校验 promise 数组元素必须是 Prisma Client
   * promise,普通 Promise/async 函数返回会被拒("All elements of the array
   * need to be Prisma Client promises")。
   */
  private upsertResolution(alertId: string, resolvedDate: string, resolvedBy: string) {
    const resolvedAt = new Date();
    if (this.prisma.operationAlertResolution) {
      return this.prisma.operationAlertResolution.upsert({
        where: { alertId_resolvedDate: { alertId, resolvedDate } },
        update: { resolvedBy, resolvedAt },
        create: { alertId, resolvedDate, resolvedBy, resolvedAt }
      });
    }
    return this.prisma.$executeRawUnsafe(
      ALERT_UPSERT_SQL,
      alertId,
      resolvedDate,
      resolvedBy,
      toSqliteDateTime(resolvedAt)
    );
  }

  /** 供 DashboardService 内部使用 */
  rankAlerts(alerts: OperationAlert[]) {
    return alerts
      .map((alert) => ({ ...alert, priorityScore: this.alertPriorityScore(alert) }))
      .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
  }

  /**
   * Residual #274: return Set + honesty meta so callers can surface silent clip.
   * take LIMIT+1 + orderBy so clip is deterministic; truncated when head is full.
   */
  async loadResolvedAlertIds(dateKey: string): Promise<{
    ids: Set<string>;
    truncated: boolean;
    limit: number;
    loaded: number;
  }> {
    const limit = RESOLVED_ALERT_DAY_LIMIT;
    // Resolutions are per-day; hard-cap so a noisy day cannot load unbounded rows.
    if (this.prisma.operationAlertResolution) {
      const rows = await this.prisma.operationAlertResolution.findMany({
        where: { resolvedDate: dateKey },
        select: { alertId: true },
        // Deterministic clip: oldest resolutions first (stable across reloads).
        orderBy: { resolvedAt: 'asc' },
        take: limit + 1
      });
      const truncated = rows.length > limit;
      const kept = truncated ? rows.slice(0, limit) : rows;
      return {
        ids: new Set(kept.map((row: { alertId: string }) => row.alertId)),
        truncated,
        limit,
        loaded: kept.length
      };
    }
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT "alertId" FROM "OperationAlertResolution" WHERE "resolvedDate" = ? ORDER BY "resolvedAt" ASC LIMIT ?`,
      dateKey,
      limit + 1
    )) as Array<{ alertId: string }>;
    const truncated = rows.length > limit;
    const kept = truncated ? rows.slice(0, limit) : rows;
    return {
      ids: new Set(kept.map((row) => row.alertId)),
      truncated,
      limit,
      loaded: kept.length
    };
  }

  alertPriorityScore(alert: OperationAlert): number {
    return ALERT_LEVEL_WEIGHTS[alert.level] + (ALERT_TYPE_WEIGHTS[alert.type] ?? 0);
  }

  filterAlerts(alerts: OperationAlert[], query: AlertQuery): OperationAlert[] {
    const keyword = query.keyword?.trim().toLowerCase();
    return alerts
      .filter((alert) => (query.level ? alert.level === query.level : true))
      .filter((alert) => (query.type ? alert.type === query.type : true))
      .filter((alert) => {
        if (!keyword) return true;
        return [
          alert.packageId,
          alert.packageName,
          alert.merchantName,
          alert.areaName,
          alert.title,
          alert.reason,
          alert.action,
          alert.type
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      });
  }

  buildAlertSummary(allAlerts: OperationAlert[], activeAlerts: OperationAlert[]) {
    const countByLevel = (rows: OperationAlert[], level: OperationAlert['level']) =>
      rows.filter((alert) => alert.level === level).length;
    return {
      totalCount: allAlerts.length,
      activeCount: activeAlerts.length,
      resolvedCount: allAlerts.length - activeAlerts.length,
      dangerCount: countByLevel(activeAlerts, 'danger'),
      warningCount: countByLevel(activeAlerts, 'warning'),
      infoCount: countByLevel(activeAlerts, 'info'),
      packageCount: new Set(activeAlerts.map((alert) => alert.packageId)).size,
      typeDistribution: activeAlerts.reduce<Record<string, number>>((acc, alert) => {
        acc[alert.type] = (acc[alert.type] ?? 0) + 1;
        return acc;
      }, {})
    };
  }

  /** Residual #283: Top-N focus package head; return honesty alongside items. */
  buildAlertPackageFocus(alerts: OperationAlert[]): {
    items: Array<{
      packageId: string;
      packageName: string;
      merchantName: string;
      areaName: string;
      alertCount: number;
      dangerCount: number;
      warningCount: number;
      priorityScore: number;
      mainReason: string;
      nextAction: string;
      alertIds: string[];
      types: string[];
    }>;
    limit: number;
    matched: number;
    truncated: boolean;
  } {
    const FOCUS_PACKAGE_LIMIT = 8;
    const grouped = new Map<string, OperationAlert[]>();
    alerts.forEach((alert) => {
      grouped.set(alert.packageId, [...(grouped.get(alert.packageId) ?? []), alert]);
    });
    const ranked = Array.from(grouped.values())
      .map((rows) => {
        const first = rows[0];
        return {
          packageId: first.packageId,
          packageName: first.packageName,
          merchantName: first.merchantName,
          areaName: first.areaName,
          alertCount: rows.length,
          dangerCount: rows.filter((a) => a.level === 'danger').length,
          warningCount: rows.filter((a) => a.level === 'warning').length,
          priorityScore: Math.max(...rows.map((a) => this.alertPriorityScore(a))),
          mainReason: rows[0].reason,
          nextAction: rows[0].action,
          alertIds: rows.map((a) => a.alertId),
          types: [...new Set(rows.map((a) => a.type))]
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore || b.alertCount - a.alertCount);
    const matched = ranked.length;
    const items = ranked.slice(0, FOCUS_PACKAGE_LIMIT);
    return {
      items,
      limit: FOCUS_PACKAGE_LIMIT,
      matched,
      truncated: matched > items.length
    };
  }

  private resolvePagination(page?: number, pageSize?: number, total = 0) {
    // alert list 默认 pageSize=80;并对 page 做"不超过最大页"夹紧,避免越界空响应
    const {
      page: safePage,
      pageSize: safePageSize,
      totalPages
    } = resolvePagination(page, pageSize ?? 80, total);
    const clampedPage = Math.min(totalPages, safePage);
    return {
      page: clampedPage,
      pageSize: safePageSize,
      offset: (clampedPage - 1) * safePageSize
    };
  }

  /** 当天北京业务日 —— 同一方法多次调用重新取,避免跨天场景下出现日期漂移。 */
  private todayKey(): string {
    return beijingDateKey(new Date());
  }
}
