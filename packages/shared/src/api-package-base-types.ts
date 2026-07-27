import type { OperationAlert, PackageScoreBreakdown, RecommendPackageItem } from './domain-types';
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
  /**
   * Residual #267: true matched selling count before SCORE/CACHE caps.
   * Prefer this over pagination.total when explaining coverage to operators.
   */
  matchedCount?: number;
  /** Residual #267: RECOMMEND_CACHE_CAP ceiling for the ranked head. */
  limit?: number;
  /** Residual #267: true when ranked packages were clipped by RECOMMEND_CACHE_CAP. */
  truncated?: boolean;
}
export interface CategoriesResponse {
  categories: string[];
}
export type { PackageScoreBreakdown, OperationAlert };
