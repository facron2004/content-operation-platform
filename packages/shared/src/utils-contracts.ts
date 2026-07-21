import type { OperationAlert, RecommendPackageItem, UserRole } from './domain-types';
export interface RecommendQuery {
  date?: string;
  areaId?: string;
  merchantId?: string;
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
}
export interface AlertQuery {
  role?: UserRole;
  level?: OperationAlert['level'];
  type?: OperationAlert['type'];
  keyword?: string;
  page?: number;
  pageSize?: number;
}
