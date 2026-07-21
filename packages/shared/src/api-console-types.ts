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
  };
  alerts: OperationAlert[];
}
export type { AlertsResponse } from './api-alerts-types';
