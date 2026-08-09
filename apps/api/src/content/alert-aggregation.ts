import type { AlertQuery, OperationAlert, RecommendPackageItem } from '@content/shared';

export type AlertScope = {
  areaId?: string;
  merchantId?: string;
  areaIds?: string[];
  merchantIds?: string[];
};

/** Aggregate cache key deliberately excludes page, pageSize and row filters. */
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

/** Flatten package alerts and delegate ordering to the caller. */
export function extractRankedAlerts(
  packages: Array<Pick<RecommendPackageItem, 'operationAlerts'>>,
  rank: (alerts: OperationAlert[]) => OperationAlert[]
): OperationAlert[] {
  return rank(packages.flatMap((pkg) => pkg.operationAlerts ?? []));
}

// Keep severity and alert-type ordering in one pure, testable rule set.
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

export function alertPriorityScore(alert: OperationAlert): number {
  return ALERT_LEVEL_WEIGHTS[alert.level] + (ALERT_TYPE_WEIGHTS[alert.type] ?? 0);
}

export function rankAlerts(
  alerts: OperationAlert[]
): Array<OperationAlert & { priorityScore: number }> {
  return alerts
    .map((alert) => ({ ...alert, priorityScore: alertPriorityScore(alert) }))
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
}

export function filterAlerts(alerts: OperationAlert[], query: AlertQuery): OperationAlert[] {
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

export function buildAlertSummary(allAlerts: OperationAlert[], activeAlerts: OperationAlert[]) {
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

export type AlertPackageFocusItem = {
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
};

export type AlertPackageFocus = {
  items: AlertPackageFocusItem[];
  limit: number;
  matched: number;
  truncated: boolean;
};

export const FOCUS_PACKAGE_LIMIT = 8;

/** Group active alerts by package and expose the capped head honestly. */
export function buildAlertPackageFocus(
  alerts: OperationAlert[],
  priorityScore: (alert: OperationAlert) => number = alertPriorityScore
): AlertPackageFocus {
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
        dangerCount: rows.filter((alert) => alert.level === 'danger').length,
        warningCount: rows.filter((alert) => alert.level === 'warning').length,
        priorityScore: Math.max(...rows.map((alert) => priorityScore(alert))),
        mainReason: first.reason,
        nextAction: first.action,
        alertIds: rows.map((alert) => alert.alertId),
        types: [...new Set(rows.map((alert) => alert.type))]
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
