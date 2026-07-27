import type {
  RecommendResponse,
  PackageAnalysisResponse,
  PackageDetailResponse,
  CategoriesResponse
} from '@content/shared';
import client from '../http-client';
import { cachedGet, clearCache } from '../cache.service';

export type RecommendationsParams = {
  role?: string;
  areaId?: string;
  merchantId?: string;
  status?: 'selling';
  category?: string;
  inventoryMin?: number;
  inventoryMax?: number;
  inventoryFlag?: 'unsold';
  // Residual #225: as-of business day (RecommendationsQueryDto.date).
  date?: string;
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

/**
 * Residual #232: force re-crawl package detail (RBAC admin/platform_operator).
 * POST /content/packages/:id/detail/refresh — not a re-GET of the cached path.
 */
export async function refreshPackageDetail(
  packageId: string
): Promise<PackageDetailResponse & { message?: string }> {
  const id = encodeURIComponent(packageId);
  const { data } = await client.post<PackageDetailResponse & { message?: string }>(
    `/content/packages/${id}/detail/refresh`
  );
  // Drop any stale SPA GET cache for this package so subsequent loads see fresh data.
  clearCache(`/content/packages/${packageId}/detail`);
  clearCache(`/content/packages/${id}/detail`);
  return data;
}

export const getCategories = (params: { areaId?: string; role?: string } = {}) =>
  get<CategoriesResponse>('/content/packages/categories', params);
