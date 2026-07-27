import type { OperationAlert, OperationCard } from '@content/shared';
import type { ConsoleResponse } from '../../../services/api';

export interface ConsoleSummary {
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
}

export interface CommunityTask {
  taskId: string;
  groupName: string;
  plannedTime: string;
  channel: string;
  packageId: string;
  reason: string;
}

export interface OperationConsoleData {
  date: string;
  summary: ConsoleSummary;
  mustPushPackages: OperationCard[];
  riskPackages: OperationCard[];
  hotOpportunities: OperationCard[];
  slowMovingPackages: OperationCard[];
  communityTasks: CommunityTask[];
  yesterdayReview: {
    date: string;
    whatHappened: string[];
    tomorrowSuggestions: string[];
    // Residual #282: daily-review Top-N list-head honesty.
    reviewListLimit?: number;
    goodMatched?: number;
    goodTruncated?: boolean;
    weakMatched?: number;
    weakTruncated?: boolean;
    copyMatched?: number;
    copyTruncated?: boolean;
  };
  alerts: OperationAlert[];
  // Residual #275: RECOMMEND_CACHE_CAP source-cap honesty.
  sourceMatchedCount?: number;
  sourceLimit?: number;
  sourceTruncated?: boolean;
  // Residual #274 projection: resolution-day clip honesty on ops console.
  resolvedIdsLimit?: number;
  resolvedIdsLoaded?: number;
  resolvedIdsTruncated?: boolean;
  // Residual #280: focus-panel / alert-preview cap honesty.
  panelLimit?: number;
  panelTruncated?: boolean;
  alertsLimit?: number;
  alertsTruncated?: boolean;
  // Residual #290: GeneratedCopy title-join honesty on ops console.
  titleJoinLimit?: number;
  titleJoinLoaded?: number;
  titleJoinTruncated?: boolean;
  titleJoinMissed?: number;
}

export const emptyConsoleData: OperationConsoleData = {
  date: '',
  summary: {
    sellingCount: 0,
    mustPushCount: 0,
    riskCount: 0,
    hotOpportunityCount: 0,
    slowMovingCount: 0,
    communityTaskCount: 0,
    avgScore: 0,
    dangerAlertCount: 0,
    warningAlertCount: 0,
    activeAlertCount: 0,
    resolvedAlertCount: 0,
    updatedAt: '',
    dataSource: 'JeeSite',
    sellingOnly: true
  },
  mustPushPackages: [],
  riskPackages: [],
  hotOpportunities: [],
  slowMovingPackages: [],
  communityTasks: [],
  yesterdayReview: { date: '', whatHappened: [], tomorrowSuggestions: [] },
  alerts: []
};

function mapConsoleSummary(summary: ConsoleResponse['summary'] | undefined | null): ConsoleSummary {
  return {
    sellingCount: summary?.sellingCount ?? 0,
    mustPushCount: summary?.mustPushCount ?? 0,
    riskCount: summary?.riskCount ?? 0,
    hotOpportunityCount: summary?.hotOpportunityCount ?? 0,
    slowMovingCount: summary?.slowMovingCount ?? 0,
    communityTaskCount: summary?.communityTaskCount ?? 0,
    avgScore: summary?.avgScore ?? 0,
    dangerAlertCount: summary?.dangerAlertCount ?? 0,
    warningAlertCount: summary?.warningAlertCount ?? 0,
    activeAlertCount: summary?.activeAlertCount ?? 0,
    resolvedAlertCount: summary?.resolvedAlertCount ?? 0,
    updatedAt: summary?.updatedAt ?? '',
    dataSource: summary?.dataSource ?? 'JeeSite',
    sellingOnly: summary?.sellingOnly ?? true
  };
}

export function mapConsoleResponse(raw: ConsoleResponse): OperationConsoleData {
  return {
    date: raw.date ?? emptyConsoleData.date,
    summary: mapConsoleSummary(raw.summary),
    mustPushPackages: raw.mustPushPackages ?? [],
    riskPackages: raw.riskPackages ?? [],
    hotOpportunities: raw.hotOpportunities ?? [],
    slowMovingPackages: raw.slowMovingPackages ?? [],
    communityTasks: (raw.communityTasks ?? []) as CommunityTask[],
    yesterdayReview: raw.yesterdayReview ?? emptyConsoleData.yesterdayReview,
    alerts: (raw.alerts ?? []) as OperationAlert[],
    // Residual #275: forward RECOMMEND_CACHE_CAP source honesty.
    sourceMatchedCount: raw.sourceMatchedCount,
    sourceLimit: raw.sourceLimit,
    sourceTruncated: raw.sourceTruncated === true,
    // Residual #274 projection on ops console.
    resolvedIdsLimit: raw.resolvedIdsLimit,
    resolvedIdsLoaded: raw.resolvedIdsLoaded,
    resolvedIdsTruncated: raw.resolvedIdsTruncated === true,
    // Residual #280: focus-panel / alert-preview cap honesty.
    panelLimit: raw.panelLimit,
    panelTruncated: raw.panelTruncated === true,
    alertsLimit: raw.alertsLimit,
    alertsTruncated: raw.alertsTruncated === true,
    // Residual #290: GeneratedCopy title-join honesty.
    titleJoinLimit: raw.titleJoinLimit,
    titleJoinLoaded: raw.titleJoinLoaded,
    titleJoinTruncated: raw.titleJoinTruncated === true,
    titleJoinMissed: raw.titleJoinMissed
  };
}
