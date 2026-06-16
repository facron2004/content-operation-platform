import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Channel, OperationCard, RecommendPackageItem, UserRole } from '@content/shared';
import {
  buildCommunityTasks,
  buildDailyReview,
  buildDerivedCommunities,
  toOperationCard
} from '../domain/operation-rules';
import { PrismaService } from '../prisma/prisma.service';
import { AlertService } from './alert.service';
import { mapPerformance } from './mappers';
import { localDateKey } from './shared-helpers';
import type { RecommendQuery, RecommendationResult } from './content.service';

type GetRecommendationsFn = (q: RecommendQuery) => Promise<RecommendationResult>;

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AlertService) private readonly alertService: AlertService
  ) {}

  /**
   * 今日运营作战台：必推/风险/爆品/滞销/社群/预警/复盘
   * getRecommendations 通过参数注入避免循环依赖。
   */
  async getTodayOperationConsole(
    role: UserRole | undefined,
    getRecommendations: GetRecommendationsFn
  ) {
    const recommendations = await getRecommendations({ role, status: 'selling' });
    const packages = recommendations.packages;
    const cardMap = this.operationCardMap(packages);
    const cards = Array.from(cardMap.values());

    const allAlerts = this.alertService.rankAlerts(
      packages.flatMap((pkg: RecommendPackageItem) => pkg.operationAlerts ?? [])
    );
    const resolvedAlertIds = await this.alertService.loadResolvedAlertIds(recommendations.date);
    const alerts = allAlerts.filter((alert) => !resolvedAlertIds.has(alert.alertId));

    const communities = buildDerivedCommunities(packages, cardMap);
    const communityTasks = buildCommunityTasks(communities).slice(0, 8);
    const performanceRows = await this.loadPerformanceRows();
    const review = buildDailyReview(this.yesterdayKey(), cards, performanceRows);

    const dangerAlerts = alerts.filter((a) => a.level === 'danger');
    const warningAlerts = alerts.filter((a) => a.level === 'warning');
    const dangerRiskIds = new Set(dangerAlerts.map((a) => a.packageId));
    const riskIds = new Set(alerts.filter((a) => a.level !== 'info').map((a) => a.packageId));

    const riskPackages = cards
      .filter((c) => riskIds.has(c.packageId))
      .sort(
        (a, b) =>
          (dangerRiskIds.has(b.packageId) ? 1 : 0) - (dangerRiskIds.has(a.packageId) ? 1 : 0) ||
          b.score - a.score
      )
      .slice(0, 8);
    const mustPushCandidates = cards
      .filter((c) => c.stockLeft > 0 && !dangerRiskIds.has(c.packageId))
      .sort((a, b) => b.score - a.score);
    const mustPushPackages = (
      mustPushCandidates.filter((c) => c.score >= 70).length
        ? mustPushCandidates.filter((c) => c.score >= 70)
        : mustPushCandidates.filter((c) => c.score >= 55)
    ).slice(0, 8);
    const hotOpportunities = cards
      .filter((c) =>
        c.tags.some((tag) => tag.key === 'hot_restock_needed' || tag.key === 'price_advantage')
      )
      .slice(0, 8);
    const slowMovingPackages = cards
      .filter((c) => c.tags.some((tag) => tag.key === 'continuous_slow'))
      .slice(0, 8);

    return {
      date: recommendations.date,
      summary: {
        sellingCount: packages.length,
        mustPushCount: mustPushPackages.length,
        riskCount: riskPackages.length,
        hotOpportunityCount: hotOpportunities.length,
        slowMovingCount: slowMovingPackages.length,
        communityTaskCount: communityTasks.length,
        avgScore: cards.length
          ? Math.round(cards.reduce((sum, c) => sum + c.score, 0) / cards.length)
          : 0,
        dangerAlertCount: dangerAlerts.length,
        warningAlertCount: warningAlerts.length,
        activeAlertCount: alerts.length,
        resolvedAlertCount: allAlerts.length - alerts.length,
        updatedAt: new Date().toISOString(),
        dataSource: 'JeeSite',
        sellingOnly: true
      },
      mustPushPackages,
      riskPackages,
      hotOpportunities,
      slowMovingPackages,
      communityTasks,
      yesterdayReview: review,
      alerts: alerts.slice(0, 30)
    };
  }

  /**
   * Dashboard 摘要：文案数量、GMV、转化率、套餐状态分布。
   * 使用 SQL 聚合代替 findMany + 内存 reduce。
   */
  async getDashboardSummary(
    getRecommendations: GetRecommendationsFn,
    recommendationCache: Map<string, { data: RecommendationResult; expiresAt: number }>,
    recommendationCacheKey: (q: RecommendQuery) => string,
    getCachedRecommendations: GetRecommendationsFn
  ) {
    const [generatedCount, approvedCount, pushedCount, pendingCount, riskCount] = await Promise.all(
      [
        this.prisma.generatedCopy.count(),
        this.prisma.generatedCopy.count({ where: { auditStatus: 'approved' } }),
        this.prisma.copyPerformance.count(),
        this.prisma.generatedCopy.count({ where: { auditStatus: 'pending' } }),
        this.prisma.generatedCopy.count({ where: { auditStatus: 'risk' } })
      ]
    );

    // SQL 聚合代替全量 findMany
    const [totals] = (await this.prisma.$queryRawUnsafe(`
      SELECT
        COALESCE(SUM("exposureCount"), 0) as "exposureCount",
        COALESCE(SUM("clickCount"), 0) as "clickCount",
        COALESCE(SUM("orderCount"), 0) as "orderCount",
        COALESCE(SUM("verifyCount"), 0) as "verifyCount",
        COALESCE(SUM("gmv"), 0) as "gmv"
      FROM "CopyPerformance"
    `)) as Array<{
      exposureCount: number;
      clickCount: number;
      orderCount: number;
      verifyCount: number;
      gmv: number;
    }>;

    // 尝试从缓存获取推荐结果
    const cacheKey = recommendationCacheKey({ status: 'selling' });
    const packagesSummary = {
      sellingCount: 0,
      countByStatus: {} as Record<string, number>,
      top5: [] as RecommendPackageItem[]
    };
    try {
      let recommendations = recommendationCache.get(cacheKey)?.data;
      if (!recommendations) recommendations = await getCachedRecommendations({ status: 'selling' });
      packagesSummary.sellingCount = recommendations.packages.length;
      packagesSummary.countByStatus = this.statusDistribution(recommendations.packages);
      packagesSummary.top5 = recommendations.packages.slice(0, 5);
    } catch {
      this.logger.warn('外部 API 不可用，dashboard 使用兜底数据');
    }

    const clickCount = Number(totals.clickCount);
    const orderCount = Number(totals.orderCount);
    const verifyCount = Number(totals.verifyCount);
    const gmv = Number(totals.gmv);

    return {
      generatedCount,
      approvedCount,
      pushedCount,
      pendingCount,
      riskCount,
      totalClickCount: clickCount,
      totalOrderCount: orderCount,
      totalVerifyCount: verifyCount,
      totalGmv: Number(gmv.toFixed(2)),
      contentConversionRate: clickCount === 0 ? 0 : Number((orderCount / clickCount).toFixed(4)),
      verifyConversionRate: orderCount === 0 ? 0 : Number((verifyCount / orderCount).toFixed(4)),
      statusDistribution: packagesSummary.countByStatus,
      topPackages: packagesSummary.top5,
      riskPackages:
        Object.entries(packagesSummary.countByStatus).filter(
          ([status]) => status === 'high_refund_risk'
        ).length > 0
          ? packagesSummary.top5.filter(
              (pkg) => pkg.status === 'high_refund_risk' || pkg.promotionLevel === 'D'
            )
          : []
    };
  }

  /**
   * 效果数据：文案性能、版本对比、AI 复盘。
   */
  async getPerformance(getCachedRecommendations: GetRecommendationsFn) {
    const [performances, copies] = await Promise.all([
      this.prisma.copyPerformance.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
      this.prisma.generatedCopy.findMany({ take: 500 })
    ]);
    type CopyRow = (typeof copies)[number];
    type PerfRow = (typeof performances)[number];
    const copiesById = new Map<string, CopyRow>(copies.map((c: CopyRow) => [c.contentId, c]));

    const recommendations = await getCachedRecommendations({ status: 'selling' });
    const cards = Array.from(this.operationCardMap(recommendations.packages).values());
    const review = buildDailyReview(
      this.yesterdayKey(),
      cards,
      performances.map((p: PerfRow) => ({
        contentId: p.contentId,
        title: copiesById.get(p.contentId)?.title ?? '-',
        channel: p.channel as Channel,
        conversionRate: p.conversionRate,
        orderCount: p.orderCount,
        groupId: p.groupId
      }))
    );

    return {
      items: performances.map((p: PerfRow) => {
        const copy = copiesById.get(p.contentId);
        return {
          ...mapPerformance(p),
          copyVersion: copy?.copyVersion ?? '-',
          title: copy?.title ?? '-'
        };
      }),
      versionComparison: performances.map((p: PerfRow) => {
        const copy = copiesById.get(p.contentId);
        return {
          copyVersion: copy?.copyVersion ?? '-',
          titleDirection: copy?.scenario ?? '-',
          clickCount: p.clickCount,
          orderCount: p.orderCount,
          verifyCount: p.verifyCount,
          conversionRate: p.conversionRate
        };
      }),
      review
    };
  }

  statusDistribution(packages: RecommendPackageItem[]): Record<string, number> {
    return packages.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});
  }

  private operationCardMap(packages: RecommendPackageItem[]) {
    return new Map<string, OperationCard>(
      packages
        .filter((pkg) => pkg.scoreBreakdown)
        .map((pkg) => [
          pkg.packageId,
          toOperationCard(pkg, pkg.scoreBreakdown!, pkg.operationTags ?? [])
        ])
    );
  }

  private async loadPerformanceRows() {
    const [performances, copies] = await Promise.all([
      this.prisma.copyPerformance.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
      this.prisma.generatedCopy.findMany({ take: 500 })
    ]);
    type CopyRow = (typeof copies)[number];
    type PerfRow = (typeof performances)[number];
    const copiesById = new Map<string, CopyRow>(copies.map((c: CopyRow) => [c.contentId, c]));
    return performances.map((p: PerfRow) => ({
      contentId: p.contentId,
      title: copiesById.get(p.contentId)?.title ?? '-',
      channel: p.channel as Channel,
      conversionRate: p.conversionRate,
      orderCount: p.orderCount,
      groupId: p.groupId
    }));
  }

  private yesterdayKey(): string {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return localDateKey(date);
  }
}
