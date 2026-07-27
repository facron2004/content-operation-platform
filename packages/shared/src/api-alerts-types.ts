export interface AlertsResponse {
  items: Array<{
    alertId: string;
    title: string;
    packageName: string;
    merchantName: string;
    areaName: string;
    reason: string;
    action: string;
    level: string;
    type: string;
    priorityScore?: number;
  }>;
  summary: {
    totalCount: number;
    activeCount: number;
    resolvedCount: number;
    dangerCount: number;
    warningCount: number;
    infoCount: number;
    packageCount: number;
    typeDistribution: Record<string, number>;
  };
  topPackages: Array<{
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
  }>;
  /**
   * Residual #283: Top-N focus package head honesty — cards are clipped;
   * summary.packageCount stays full distinct active packages.
   */
  focusPackageLimit?: number;
  focusPackageMatched?: number;
  focusPackageTruncated?: boolean;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  /**
   * Residual #274: honesty for RESOLVED_ALERT_DAY_LIMIT silent clip.
   * When truncated, some already-resolved alerts may still appear active.
   */
  resolvedIdsLimit?: number;
  resolvedIdsLoaded?: number;
  resolvedIdsTruncated?: boolean;
  /**
   * Residual #275: honesty for RECOMMEND_CACHE_CAP source undercount.
   * Alerts flatten operationAlerts from the recommend ranked head only.
   */
  sourceMatchedCount?: number;
  sourceLimit?: number;
  sourceTruncated?: boolean;
}
