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
}
export interface CategoriesResponse {
  categories: string[];
}
export type { PackageScoreBreakdown, OperationAlert };
