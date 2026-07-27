import type { OperationAlert, OperationCard } from './operation-alert-card-types';
import type { CommunityPushTask, DailyOperationReview } from './operation-console-community-types';
export interface TodayOperationConsoleSummary {
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
  dataSource: 'JeeSite';
  sellingOnly: boolean;
}
export interface TodayOperationConsole {
  date: string;
  summary: TodayOperationConsoleSummary;
  mustPushPackages: OperationCard[];
  riskPackages: OperationCard[];
  hotOpportunities: OperationCard[];
  slowMovingPackages: OperationCard[];
  communityTasks: CommunityPushTask[];
  yesterdayReview: DailyOperationReview;
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
   * Residual #290: DASHBOARD_GENERATED_COPY_TAKE honesty — yesterdayReview high-
   * conversion titles join the global newest GeneratedCopy head; missing joins
   * render as '-'.
   */
  titleJoinLimit?: number;
  titleJoinLoaded?: number;
  titleJoinTruncated?: boolean;
  /** Count of performance rows whose contentId missed the GeneratedCopy head. */
  titleJoinMissed?: number;
}
