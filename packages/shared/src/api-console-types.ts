import type { OperationAlert, OperationCard } from './domain-types';
export interface ConsoleResponse {
  date: string;
  summary: {
    sellingCount: number;
    mustPushCount: number;
    riskCount: number;
    hotOpportunityCount: number;
    slowMovingCount: number;
    communityTaskCount: number;
    avgScore: number;
    dangerAlertCount: number;
    warningAlertCount: number;
    activeAlertCount: number;
    resolvedAlertCount: number;
    updatedAt: string;
    dataSource: string;
    sellingOnly: boolean;
  };
  mustPushPackages: OperationCard[];
  riskPackages: OperationCard[];
  hotOpportunities: OperationCard[];
  slowMovingPackages: OperationCard[];
  communityTasks: Array<{
    taskId: string;
    groupName: string;
    channel: string;
    plannedTime: string;
    reason: string;
    packageId: string;
    packageName: string;
  }>;
  yesterdayReview: {
    date: string;
    whatHappened: string[];
    tomorrowSuggestions: string[];
    highConversionCopies: Array<{ contentId: string; title: string; conversionRate: number }>;
    /** Residual #282: narrative uses full good/weak matches; lists stay Top-N. */
    reviewListLimit?: number;
    goodMatched?: number;
    goodTruncated?: boolean;
    weakMatched?: number;
    weakTruncated?: boolean;
    copyMatched?: number;
    copyTruncated?: boolean;
  };
  alerts: OperationAlert[];
  /**
   * Residual #275: RECOMMEND_CACHE_CAP source honesty — risk/alert tiles are
   * derived from the capped recommend head, not the full selling catalog.
   */
  sourceMatchedCount?: number;
  sourceLimit?: number;
  sourceTruncated?: boolean;
  /** Residual #274 projection: resolution-day clip honesty on ops console. */
  resolvedIdsLimit?: number;
  resolvedIdsLoaded?: number;
  resolvedIdsTruncated?: boolean;
  /**
   * Residual #280: focus-panel Top-N honesty — KPI tiles use full candidate
   * counts; package/task arrays are clipped to panelLimit.
   */
  panelLimit?: number;
  panelTruncated?: boolean;
  /** Residual #280: alert preview head (activeAlertCount stays full). */
  alertsLimit?: number;
  alertsTruncated?: boolean;
  /**
   * Residual #290: DASHBOARD_GENERATED_COPY_TAKE honesty — yesterdayReview
   * high-conversion titles join the global newest GeneratedCopy head.
   */
  titleJoinLimit?: number;
  titleJoinLoaded?: number;
  titleJoinTruncated?: boolean;
  titleJoinMissed?: number;
}
export type { AlertsResponse } from './api-alerts-types';
