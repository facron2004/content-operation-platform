import type { OperationAlert, PackageScoreBreakdown, RecommendPackageItem } from './domain-types';
export type {
  PackageDetailResponse,
  RecommendResponse,
  CategoriesResponse
} from './api-package-base-types';
export interface PackageAnalysisResponse {
  package: RecommendPackageItem;
  status: string;
  promotionScore: number;
  inventoryBacklogDays: number;
  inventoryFlag: string;
  inventoryFlagLabel: string;
  inventoryFlagLevel: string;
  inventorySalesFlag: string;
  inventorySalesLabel: string;
  inventorySalesLevel: string;
  inventoryTrend: Array<{ date: string; snapshotTime: string; remainingStock: number }>;
  salesData: Record<string, unknown>;
  operationTags: Array<{ key: string; label: string; level: string }>;
  scoreBreakdown: PackageScoreBreakdown;
  operationAlerts: OperationAlert[];
  recommendation: {
    strategy: string;
    reason: string;
    suggestedChannels: string[];
    riskTips: string[];
    copyAngles: string[];
  };
  trends: Array<{ label: string; value: number }>;
}
