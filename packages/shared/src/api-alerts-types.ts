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
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
