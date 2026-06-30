// ==================== Unified API Export ====================
// Maintains backward compatibility while using modular structure

// Export all API response types from shared package
export type {
  AICopyStatus,
  AICopyConfigPayload,
  PackageDetailResponse,
  RecommendResponse,
  PackageAnalysisResponse,
  CategoriesResponse,
  ConsoleResponse,
  AlertsResponse,
  CommunitiesResponse,
  CopiesResponse,
  GenerateCopiesResponse,
  PerformanceResponse,
  CookieStatusResponse,
  CookieUpdateResponse
} from '@content/shared';

// Export API functions
export * from './api/dashboard.api';
export * from './api/package.api';
export * from './api/config.api';
export * from './api/copy.api';
export * from './api/alert.api';
export * from './api/community.api';
export * from './api/performance.api';

// Re-export cache utilities
export {
  clearCache,
  clearPackageCache,
  clearAlertCache,
  clearDashboardCache
} from './cache.service';

// Backward compatibility: wrap all APIs in a single object
import * as dashboardApi from './api/dashboard.api';
import * as packageApi from './api/package.api';
import * as configApi from './api/config.api';
import * as copyApi from './api/copy.api';
import * as alertApi from './api/alert.api';
import * as communityApi from './api/community.api';
import * as performanceApi from './api/performance.api';
import { clearCache } from './cache.service';

export const api = {
  ...dashboardApi,
  ...packageApi,
  ...configApi,
  ...copyApi,
  ...alertApi,
  ...communityApi,
  ...performanceApi,
  clearCache
};
