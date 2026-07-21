import type {
  RecommendResponse,
  PackageAnalysisResponse,
  PackageDetailResponse,
  CategoriesResponse
} from '@content/shared';
import client from '../http-client';
import { cachedGet } from '../cache.service';

export type RecommendationsParams = {
  role?: string;
  areaId?: string;
  merchantId?: string;
  status?: 'selling';
  category?: string;
  inventoryMin?: number;
  inventoryMax?: number;
  inventoryFlag?: 'unsold';
  page?: number;
  pageSize?: number;
};

const get = <T>(url: string, params?: Record<string, unknown>, ttl = 60000) =>
  cachedGet<T>(() => client.get(url, { params }).then((r) => r.data), url, params, ttl);
export const getRecommendations = (params: RecommendationsParams = {}) =>
  get<RecommendResponse>('/content/packages/recommend', params);
export const getPackageAnalysis = (packageId: string) =>
  get<PackageAnalysisResponse>(`/content/packages/${packageId}/analysis`, undefined, 30000);
export const getPackageDetail = (packageId: string): Promise<PackageDetailResponse> =>
  get(`/content/packages/${packageId}/detail`, undefined, 30000);
export const getCategories = (params: { areaId?: string; role?: string } = {}) =>
  get<CategoriesResponse>('/content/packages/categories', params);
