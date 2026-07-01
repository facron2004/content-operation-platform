// ==================== API Response Types ====================
// Shared between backend controllers and frontend API service

import type {
  CommunityGroup,
  GeneratedCopy,
  OperationAlert,
  OperationCard,
  PackageScoreBreakdown,
  RecommendPackageItem
} from './index';

// ==================== AI Copy ====================

export interface AICopyStatus {
  enabled: boolean;
  providerName: string;
  baseURL: string;
  model: string;
  missing: string[];
  maskedApiKey: string | null;
  temperature: number;
  maxTokens: number;
}

export interface AICopyConfigPayload {
  apiKey?: string;
  baseURL: string;
  model: string;
  providerName?: string;
  temperature: number;
  maxTokens: number;
}

// ==================== Package ====================

export interface PackageDetailResponse {
  success: boolean;
  message?: string;
  data?: {
    packageId: string;
    packageTitle: string;
    sections: Array<{
      title: string;
      selectionRule?: string;
      items: Array<{ name: string; quantity: string }>;
    }>;
    fetchedAt: string;
  };
}

export interface RecommendResponse {
  date: string;
  areaId: string;
  packages: RecommendPackageItem[];
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
}

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

export interface CategoriesResponse {
  categories: string[];
}

// ==================== Console / Dashboard ====================

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

// ==================== Alerts ====================

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

// ==================== Communities ====================

export interface CommunitiesResponse {
  items: CommunityGroup[];
}

// ==================== Copy / Content ====================

export interface CopiesResponse {
  items: GeneratedCopy[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface GenerateCopiesResponse {
  contentList: GeneratedCopy[];
}

// ==================== Performance ====================

export interface PerformanceResponse {
  items: Array<{
    contentId: string;
    title: string;
    copyVersion: string;
    channel: string;
    clickCount: number;
    orderCount: number;
    verifyCount: number;
    refundCount: number;
    gmv: number;
    conversionRate: number;
  }>;
  versionComparison: Array<{
    copyVersion: string;
    titleDirection: string;
    clickCount: number;
    orderCount: number;
    verifyCount: number;
    conversionRate: number;
  }>;
  review: {
    date: string;
    whatHappened: string[];
    tomorrowSuggestions: string[];
    highConversionCopies: Array<{ contentId: string; title: string; conversionRate: number }>;
  };
}

// ==================== Cookie Management ====================

export interface CookieStatusResponse {
  hasCookie: boolean;
  maskedCookie: string | null;
  isValid: boolean;
  username: string | null;
  failedAttempts: number;
  cooldownMinutes: number;
  lastLoginTime: string | null;
}

export interface CookieUpdateResponse {
  success: boolean;
  error?: string;
}

// ==================== Alert Actions ====================

export interface AlertResolveResponse {
  success: boolean;
  message?: string;
}

export interface AlertBatchResolveResponse {
  success: boolean;
  resolved: number;
  failed: number;
  errors?: string[];
}

// ==================== Battle Card ====================
