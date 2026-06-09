import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { OperationAlert, RecommendPackageItem, UserRole } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ContentService } from './content.service';
import { localDateKey } from './shared-helpers';

// 合并了 resolveOperationAlert / resolveOperationAlerts 中重复的 SQL 字符串
const ALERT_UPSERT_SQL = `
  INSERT INTO "OperationAlertResolution" ("alertId", "resolvedDate", "resolvedBy", "resolvedAt")
  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT("alertId", "resolvedDate") DO UPDATE SET
    "resolvedBy" = excluded."resolvedBy",
    "resolvedAt" = CURRENT_TIMESTAMP`;

export interface AlertQuery {
  role?: UserRole;
  level?: OperationAlert['level'];
  type?: OperationAlert['type'];
  keyword?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * 从 ContentService 注入推荐结果，避免循环依赖。
   * 通过方法参数传入推荐结果而非构造函数注入。
   */
  async getOperationAlerts(query: AlertQuery, getRecommendations: (q: any) => Promise<any>) {
    const recommendations = await getRecommendations({ role: query.role, status: 'selling' });
    const allAlerts = this.rankAlerts(recommendations.packages.flatMap((pkg: RecommendPackageItem) => pkg.operationAlerts ?? []));
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
    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT "alertId" FROM "OperationAlertResolution" WHERE "resolvedDate" = ?`,
      dateKey
    ) as Array<{ alertId: string }>;
    return new Set(rows.map((row: { alertId: string }) => row.alertId));
  }

  alertPriorityScore(alert: OperationAlert): number {
    const levelScore = alert.level === 'danger' ? 80 : alert.level === 'warning' ? 52 : 20;
    const typeScore: Partial<Record<OperationAlert['type'], number>> = {
      high_refund: 20, continuous_unsold: 18, inventory_abnormal: 17,
      price_abnormal: 16, abnormal_sold_out: 14, low_verify: 12,
      merchant_abnormal: 10, missing_use_rules: 8, missing_selling_points: 4
    };
    return levelScore + (typeScore[alert.type] ?? 0);
  }

  filterAlerts(alerts: OperationAlert[], query: AlertQuery): OperationAlert[] {
    const keyword = query.keyword?.trim().toLowerCase();
    return alerts
      .filter((alert) => (query.level ? alert.level === query.level : true))
      .filter((alert) => (query.type ? alert.type === query.type : true))
      .filter((alert) => {
        if (!keyword) return true;
        return [alert.packageId, alert.packageName, alert.merchantName, alert.areaName,
          alert.title, alert.reason, alert.action, alert.type]
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
          packageId: first.packageId, packageName: first.packageName,
          merchantName: first.merchantName, areaName: first.areaName,
          alertCount: rows.length,
          dangerCount: rows.filter((a) => a.level === 'danger').length,
          warningCount: rows.filter((a) => a.level === 'warning').length,
          priorityScore: Math.max(...rows.map((a) => this.alertPriorityScore(a))),
          mainReason: rows[0].reason, nextAction: rows[0].action,
          alertIds: rows.map((a) => a.alertId),
          types: [...new Set(rows.map((a) => a.type))]
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore || b.alertCount - a.alertCount)
      .slice(0, 8);
  }

  private resolvePagination(page?: number, pageSize?: number, total = 0) {
    const safePageSize = Math.min(200, Math.max(1, Number.isFinite(pageSize) ? Number(pageSize) : 80));
    const maxPage = Math.max(1, Math.ceil(total / safePageSize));
    const safePage = Math.min(maxPage, Math.max(1, Number.isFinite(page) ? Number(page) : 1));
    return { page: safePage, pageSize: safePageSize, offset: (safePage - 1) * safePageSize };
  }
}
