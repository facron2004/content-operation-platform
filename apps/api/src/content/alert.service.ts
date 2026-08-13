import { Inject, Injectable } from '@nestjs/common';
import type { AlertQuery, OperationAlert } from '@content/shared';
import { resolvePagination, beijingDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { RecommendQuery, RecommendationResult } from './content.service';
import { TtlCache } from '../common';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../common/heavy-aggregate-gate';
import { RECOMMEND_CACHE_CAP } from '../common/sql-chunk';
import {
  loadResolvedAlertIds as loadResolvedAlertIdsFromStore,
  resolveOperationAlert as resolveAlertFromStore,
  resolveOperationAlerts as resolveAlertsFromStore,
  type ResolvedAlertIds
} from './alert-resolution';
import {
  alertAggregateCacheKey,
  alertPriorityScore as calculateAlertPriorityScore,
  buildAlertPackageFocus as buildAlertPackageFocusRows,
  buildAlertSummary as summarizeAlerts,
  extractRankedAlerts,
  filterAlerts as filterAlertRows,
  rankAlerts as rankAlertRows,
  type AlertPackageFocus,
  type AlertScope
} from './alert-aggregation';

export {
  alertAggregateCacheKey,
  alertPriorityScore,
  buildAlertPackageFocus,
  extractRankedAlerts
} from './alert-aggregation';
export type { AlertScope } from './alert-aggregation';

type GetRecommendationsFn = (q: RecommendQuery) => Promise<RecommendationResult>;

/** Ranked alert aggregate is recomputed from full recommend catalog — cache across page flips. */
const ALERT_AGGREGATE_TTL_MS = 60_000;

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
    scope: AlertScope = {},
    force = false
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
      this.aggregateCache.getOrLoad<AlertAggregatePayload>(cacheKey, force, async () => {
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
    return resolveAlertFromStore(this.prisma, alertId, resolvedBy, this.todayKey());
  }

  async resolveOperationAlerts(alertIds: string[], resolvedBy = 'operator') {
    return resolveAlertsFromStore(this.prisma, alertIds, resolvedBy, this.todayKey());
  }

  /** 供 DashboardService 内部使用 */
  rankAlerts(alerts: OperationAlert[]) {
    return rankAlertRows(alerts);
  }

  /**
   * Residual #274: return Set + honesty meta so callers can surface silent clip.
   * take LIMIT+1 + orderBy so clip is deterministic; truncated when head is full.
   */
  async loadResolvedAlertIds(dateKey: string): Promise<ResolvedAlertIds> {
    return loadResolvedAlertIdsFromStore(this.prisma, dateKey);
  }

  alertPriorityScore(alert: OperationAlert): number {
    return calculateAlertPriorityScore(alert);
  }

  filterAlerts(alerts: OperationAlert[], query: AlertQuery): OperationAlert[] {
    return filterAlertRows(alerts, query);
  }

  buildAlertSummary(allAlerts: OperationAlert[], activeAlerts: OperationAlert[]) {
    return summarizeAlerts(allAlerts, activeAlerts);
  }

  /** Residual #283: Top-N focus package head; return honesty alongside items. */
  buildAlertPackageFocus(alerts: OperationAlert[]): AlertPackageFocus {
    return buildAlertPackageFocusRows(alerts, (alert) => this.alertPriorityScore(alert));
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
