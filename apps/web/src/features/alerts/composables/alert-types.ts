import type { OperationAlert, PaginationMeta } from '@content/shared';

export interface AlertSummary {
  totalCount: number;
  activeCount: number;
  resolvedCount: number;
  dangerCount: number;
  warningCount: number;
  infoCount: number;
  packageCount: number;
  typeDistribution: Record<string, number>;
}

export interface AlertPackageFocus {
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
  types: OperationAlert['type'][];
}

export interface AlertItem extends OperationAlert {
  priorityScore?: number;
}

export interface AlertResponse {
  items: AlertItem[];
  summary: AlertSummary;
  topPackages: AlertPackageFocus[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  // Residual #283: Top-N focus package head honesty.
  focusPackageLimit?: number;
  focusPackageMatched?: number;
  focusPackageTruncated?: boolean;
  // Residual #274: RESOLVED_ALERT_DAY_LIMIT honesty.
  resolvedIdsLimit?: number;
  resolvedIdsLoaded?: number;
  resolvedIdsTruncated?: boolean;
  // Residual #275: RECOMMEND_CACHE_CAP source-cap honesty.
  sourceMatchedCount?: number;
  sourceLimit?: number;
  sourceTruncated?: boolean;
}

export type AlertPagination = Omit<PaginationMeta, 'totalPages'>;
export type AlertFilters = { keyword: string; level: string; type: string; date: string };
export type AlertPageCache = Map<
  string,
  { items: AlertItem[]; total: number; response: AlertResponse }
>;

export const EMPTY_ALERT_SUMMARY: AlertSummary = {
  totalCount: 0,
  activeCount: 0,
  resolvedCount: 0,
  dangerCount: 0,
  warningCount: 0,
  infoCount: 0,
  packageCount: 0,
  typeDistribution: {}
};
