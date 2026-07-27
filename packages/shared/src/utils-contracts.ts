import type { OperationAlert, RecommendPackageItem, UserRole } from './domain-types';
export interface RecommendQuery {
  date?: string;
  areaId?: string;
  merchantId?: string;
  /** Multi-scope from server-side role bindings (area_operator with multiple areas). */
  areaIds?: string[];
  /** Multi-scope from server-side role bindings (merchant_operator with multiple merchants). */
  merchantIds?: string[];
  role?: UserRole;
  status?: 'selling';
  category?: string;
  inventoryMin?: number;
  inventoryMax?: number;
  inventoryFlag?: 'unsold';
}
export interface RecommendationResult {
  date: string;
  areaId: string;
  packages: RecommendPackageItem[];
  /**
   * True matched selling count before RECOMMEND_SCORE_CAP / RECOMMEND_CACHE_CAP
   * truncates `packages`. Dashboard "销售中套餐" must use this — not packages.length.
   */
  matchedCount?: number;
}
export interface AlertQuery {
  role?: UserRole;
  /** As-of business day for inventory window (defaults to today in recommend). */
  date?: string;
  level?: OperationAlert['level'];
  type?: OperationAlert['type'];
  keyword?: string;
  page?: number;
  pageSize?: number;
}
