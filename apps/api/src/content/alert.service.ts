import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { AlertQuery, OperationAlert, RecommendPackageItem } from '@content/shared';
import { resolvePagination, localDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { RecommendQuery, RecommendationResult } from './content.service';

type GetRecommendationsFn = (q: RecommendQuery) => Promise<RecommendationResult>;

// 合并了 resolveOperationAlert / resolveOperationAlerts 中重复的 SQL 字符串
const ALERT_UPSERT_SQL = `
  INSERT INTO "OperationAlertResolution" ("alertId", "resolvedDate", "resolvedBy", "resolvedAt")
  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT("alertId", "resolvedDate") DO UPDATE SET
    "resolvedBy" = excluded."resolvedBy",
    "resolvedAt" = CURRENT_TIMESTAMP`;

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
  private readonly logger = new Logger(AlertService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * 从 ContentService 注入推荐结果，避免循环依赖。
   * 通过方法参数传入推荐结果而非构造函数注入。
   */
  async getOperationAlerts(query: AlertQuery, getRecommendations: GetRecommendationsFn) {
    const recommendations = await getRecommendations({ role: query.role, status: 'selling' });
    const allAlerts = this.rankAlerts(
      recommendations.packages.flatMap((pkg: RecommendPackageItem) => pkg.operationAlerts ?? [])
    );
    const resolvedAlertIds = await this.loadResolvedAlertIds(recommendations.date);
    const activeAlerts = allAlerts.filter((alert) => !resolvedAlertIds.has(alert.alertId));
    const filteredAlerts = this.filterAlerts(activeAlerts, query);
    const pagination = this.resolvePagination(query.page, query.pageSize, filteredAlerts.length);
    return {
      items: filteredAlerts.slice(pagination.offset, pagination.offset + pagination.pageSize),
      summary: this.buildAlertSummary(allAlerts, activeAlerts),
      topPackages: this.buildAlertPackageFocus(activeAlerts),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: filteredAlerts.length,
        totalPages: Math.max(1, Math.ceil(filteredAlerts.length / pagination.pageSize))
      }
    };
  }

  async resolveOperationAlert(alertId: string, resolvedBy = 'operator') {
    if (!alertId) throw new BadRequestException('alertId 必填');
    const resolvedDate = localDateKey(new Date());
    if (this.prisma.operationAlertResolution) {
      await this.prisma.operationAlertResolution.upsert({
        where: { alertId_resolvedDate: { alertId, resolvedDate } },
        update: { resolvedBy, resolvedAt: new Date() },
        create: { alertId, resolvedDate, resolvedBy, resolvedAt: new Date() }
      });
    } else {
      await this.prisma.$executeRawUnsafe(ALERT_UPSERT_SQL, alertId, resolvedDate, resolvedBy);
    }
    return { success: true, alertId, resolvedDate, message: '预警已标记为已处理' };
  }

  async resolveOperationAlerts(alertIds: string[], resolvedBy = 'operator') {
    const uniqueAlertIds = [...new Set((alertIds ?? []).map((id) => id?.trim()).filter(Boolean))];
    if (!uniqueAlertIds.length) throw new BadRequestException('alertIds 不能为空');
    const resolvedDate = localDateKey(new Date());
    if (this.prisma.operationAlertResolution) {
      await this.prisma.$transaction(
        uniqueAlertIds.map((alertId) =>
          this.prisma.operationAlertResolution.upsert({
            where: { alertId_resolvedDate: { alertId, resolvedDate } },
            update: { resolvedBy, resolvedAt: new Date() },
            create: { alertId, resolvedDate, resolvedBy, resolvedAt: new Date() }
          })
        )
      );
    } else {
      await this.prisma.$transaction(
        uniqueAlertIds.map((alertId) =>
          this.prisma.$executeRawUnsafe(ALERT_UPSERT_SQL, alertId, resolvedDate, resolvedBy)
        )
      );
    }
    return {
      success: true,
      alertIds: uniqueAlertIds,
      resolvedCount: uniqueAlertIds.length,
      resolvedDate,
      message: '预警已标记为已处理'
    };
  }

  /** 供 DashboardService 内部使用 */
  rankAlerts(alerts: OperationAlert[]) {
    return alerts
      .map((alert) => ({ ...alert, priorityScore: this.alertPriorityScore(alert) }))
      .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
  }

  /** 供 DashboardService 内部使用 */
  async loadResolvedAlertIds(dateKey: string): Promise<Set<string>> {
    if (this.prisma.operationAlertResolution) {
      const rows = await this.prisma.operationAlertResolution.findMany({
        where: { resolvedDate: dateKey },
        select: { alertId: true }
      });
      return new Set(rows.map((row: { alertId: string }) => row.alertId));
    }
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT "alertId" FROM "OperationAlertResolution" WHERE "resolvedDate" = ?`,
      dateKey
    )) as Array<{ alertId: string }>;
    return new Set(rows.map((row: { alertId: string }) => row.alertId));
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

  buildAlertPackageFocus(alerts: OperationAlert[]) {
    const grouped = new Map<string, OperationAlert[]>();
    alerts.forEach((alert) => {
      grouped.set(alert.packageId, [...(grouped.get(alert.packageId) ?? []), alert]);
    });
    return Array.from(grouped.values())
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
      .sort((a, b) => b.priorityScore - a.priorityScore || b.alertCount - a.alertCount)
      .slice(0, 8);
  }

  private resolvePagination(page?: number, pageSize?: number, total = 0) {
    // alert list 默认 pageSize=80;并对 page 做"不超过最大页"夹紧,避免越界空响应
    const { page: safePage, pageSize: safePageSize } = resolvePagination(
      page,
      pageSize ?? 80,
      total
    );
    const maxPage = Math.max(1, Math.ceil(total / safePageSize));
    const clampedPage = Math.min(maxPage, safePage);
    return {
      page: clampedPage,
      pageSize: safePageSize,
      offset: (clampedPage - 1) * safePageSize
    };
  }
}
