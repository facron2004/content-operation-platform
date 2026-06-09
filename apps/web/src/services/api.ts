import axios from 'axios';
import { ElMessage } from 'element-plus';
import type {
  AuditCopyRequest, AuditStatus, BattleCard, Channel,
  CommunityGroup, GeneratedCopy, GenerateCopyRequest,
  PackageScoreBreakdown, RecommendPackageItem
} from '@content/shared';

// ==================== API 响应类型 ====================

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

export interface ConsoleResponse {
  date: string;
  summary: {
    sellingCount: number; mustPushCount: number; riskCount: number;
    hotOpportunityCount: number; slowMovingCount: number; communityTaskCount: number;
    avgScore: number; dangerAlertCount: number; warningAlertCount: number;
    activeAlertCount: number; resolvedAlertCount: number;
    updatedAt: string; dataSource: string; sellingOnly: boolean;
  };
  mustPushPackages: RecommendPackageItem[];
  riskPackages: RecommendPackageItem[];
  hotOpportunities: RecommendPackageItem[];
  slowMovingPackages: RecommendPackageItem[];
  communityTasks: Array<{
    taskId: string; groupName: string; channel: string;
    plannedTime: string; reason: string; packageId: string; packageName: string;
  }>;
  yesterdayReview: {
    date: string;
    whatHappened: string[];
    tomorrowSuggestions: string[];
    highConversionCopies: Array<{ contentId: string; title: string; conversionRate: number }>;
  };
  alerts: any[];
}

export interface PackageAnalysisResponse {
  package: any;
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
  salesData: any;
  operationTags: Array<{ key: string; label: string; level: string }>;
  scoreBreakdown: PackageScoreBreakdown;
  operationAlerts: any[];
  recommendation: { strategy: string; reason: string; suggestedChannels: string[]; riskTips: string[]; copyAngles: string[] };
  trends: Array<{ label: string; value: number }>;
}

export interface AlertsResponse {
  items: Array<{
    alertId: string; title: string; packageName: string; merchantName: string;
    areaName: string; reason: string; action: string; level: string; type: string;
    priorityScore?: number;
  }>;
  summary: {
    totalCount: number; activeCount: number; resolvedCount: number;
    dangerCount: number; warningCount: number; infoCount: number; packageCount: number;
    typeDistribution: Record<string, number>;
  };
  topPackages: Array<{
    packageId: string; packageName: string; merchantName: string; areaName: string;
    alertCount: number; dangerCount: number; warningCount: number;
    priorityScore: number; mainReason: string; nextAction: string; alertIds: string[];
  }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CommunitiesResponse {
  items: CommunityGroup[];
}

export interface CopiesResponse {
  items: GeneratedCopy[];
}

export interface GenerateCopiesResponse {
  contentList: GeneratedCopy[];
}

export interface PerformanceResponse {
  items: Array<{
    contentId: string; title: string; copyVersion: string; channel: string;
    clickCount: number; orderCount: number; gmv: number; conversionRate: number;
  }>;
  versionComparison: Array<{
    copyVersion: string; titleDirection: string; clickCount: number;
    orderCount: number; verifyCount: number; conversionRate: number;
  }>;
  review: {
    date: string; whatHappened: string[]; tomorrowSuggestions: string[];
    highConversionCopies: Array<{ contentId: string; title: string; conversionRate: number }>;
  };
}

// ==================== HTTP 客户端 ====================

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 30000
});

client.interceptors.request.use(
  (config) => config,
  (error) => { ElMessage.error('请求发送失败'); return Promise.reject(error); }
);

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      ElMessage.error('请求超时。首次同步 JeeSite 全量库存可能较慢，请稍后重试');
    } else if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || error.response.data?.error;
      switch (status) {
        case 400: ElMessage.error(message || '请求参数错误'); break;
        case 401: ElMessage.error('未授权，请重新登录'); break;
        case 403: ElMessage.error('没有权限访问该资源'); break;
        case 404: ElMessage.error('请求的资源不存在'); break;
        case 500: ElMessage.error(message || '服务器内部错误'); break;
        case 502: case 503: ElMessage.error('服务暂时不可用，请稍后重试'); break;
        default: ElMessage.error(message || `请求失败 (${status})`);
      }
    } else if (error.request) {
      ElMessage.error('网络连接失败，请检查网络');
    } else {
      ElMessage.error('请求配置错误');
    }
    return Promise.reject(error);
  }
);

// ==================== 请求缓存 ====================

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const pendingRequests = new Map<string, Promise<unknown>>();

function getCacheKey(url: string, params?: Record<string, unknown>): string {
  return `${url}:${JSON.stringify(params || {})}`;
}

async function cachedGet<T>(url: string, params?: Record<string, unknown>, ttl = 60000): Promise<T> {
  const cacheKey = getCacheKey(url, params);
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data as T;

  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending as Promise<T>;

  const request = client.get(url, { params }).then(({ data }) => {
    cache.set(cacheKey, { data, expiresAt: now + ttl });
    pendingRequests.delete(cacheKey);
    return data as T;
  }).catch((error) => {
    pendingRequests.delete(cacheKey);
    throw error;
  });

  pendingRequests.set(cacheKey, request as Promise<unknown>);
  return request;
}

// ==================== API 方法 ====================

export const api = {
  async getDashboardSummary() {
    return cachedGet<Record<string, unknown>>('/content/dashboard/summary', undefined, 30000);
  },
  async getTodayOperationConsole(params: { role?: string } = {}) {
    return cachedGet<ConsoleResponse>('/content/ops/today', params, 30000);
  },
  async getRecommendations(params: {
    role?: string; areaId?: string; merchantId?: string; status?: 'selling';
    category?: string; inventoryMin?: number; inventoryMax?: number;
    inventoryFlag?: 'unsold'; page?: number; pageSize?: number;
  } = {}) {
    return cachedGet<RecommendResponse>('/content/packages/recommend', params, 60000);
  },
  async getPackageAnalysis(packageId: string) {
    return cachedGet<PackageAnalysisResponse>(`/content/packages/${packageId}/analysis`, undefined, 30000);
  },
  async getAICopyStatus(): Promise<AICopyStatus> {
    return cachedGet('/content/ai-copy/status', undefined, 30000);
  },
  async updateAICopyConfig(payload: AICopyConfigPayload): Promise<AICopyStatus> {
    const { data } = await client.post('/content/ai-copy/config', payload);
    cache.delete(getCacheKey('/content/ai-copy/status'));
    return data;
  },
  async getPackageDetail(packageId: string): Promise<PackageDetailResponse> {
    return cachedGet(`/content/packages/${packageId}/detail`, undefined, 30000);
  },
  async getCategories(params: { areaId?: string; role?: string } = {}) {
    return cachedGet<{ categories: string[] }>('/content/packages/categories', params, 60000);
  },
  async generateCopies(payload: GenerateCopyRequest): Promise<GenerateCopiesResponse> {
    const { data } = await client.post('/content/generate', payload);
    cache.clear();
    return data;
  },
  async listCopies(params: { auditStatus?: AuditStatus; channel?: Channel } = {}) {
    return cachedGet<CopiesResponse>('/content/copies', params, 30000);
  },
  async auditCopy(contentId: string, payload: AuditCopyRequest) {
    const { data } = await client.post(`/content/copies/${contentId}/audit`, payload);
    cache.clear();
    return data;
  },
  async getPerformance() {
    return cachedGet<PerformanceResponse>('/content/performance', undefined, 30000);
  },
  async getAlerts(params: {
    role?: string; level?: string; type?: string;
    keyword?: string; page?: number; pageSize?: number;
  } = {}) {
    return cachedGet<AlertsResponse>('/content/alerts', params, 30000);
  },
  async resolveAlert(alertId: string) {
    const { data } = await client.post(`/content/alerts/${encodeURIComponent(alertId)}/resolve`);
    cache.clear();
    return data;
  },
  async resolveAlerts(alertIds: string[]) {
    const { data } = await client.post('/content/alerts/resolve-batch', { alertIds });
    cache.clear();
    return data;
  },
  async getCommunities(params: { role?: string } = {}) {
    return cachedGet<CommunitiesResponse>('/content/communities', params, 30000);
  },
  async getCommunityRecommendations(groupId: string, params: { role?: string } = {}) {
    return cachedGet(`/content/communities/${encodeURIComponent(groupId)}`, params, 30000);
  },
  async generateBattleCard(packageId: string): Promise<BattleCard> {
    const { data } = await client.post('/content/battle-cards/generate', { packageId });
    return data;
  },
  clearCache() {
    cache.clear();
    pendingRequests.clear();
  }
};
