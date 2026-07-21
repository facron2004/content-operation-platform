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
  yesterdayReview: { date: string; whatHappened: string[]; tomorrowSuggestions: string[] };
  alerts: OperationAlert[];
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
    alerts: (raw.alerts ?? []) as OperationAlert[]
  };
}
