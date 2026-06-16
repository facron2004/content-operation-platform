import type {
  RecommendResponse,
  PackageAnalysisResponse,
  PackageDetailResponse,
  CategoriesResponse
} from '@content/shared';
import client from '../http-client';
import { cachedGet } from '../cache.service';

// ==================== Package APIs ====================

export async function getRecommendations(
  params: {
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
  } = {}
) {
  return cachedGet<RecommendResponse>(
    () => client.get('/content/packages/recommend', { params }).then((res) => res.data),
    '/content/packages/recommend',
    params,
    60000
  );
}

export async function getPackageAnalysis(packageId: string) {
  return cachedGet<PackageAnalysisResponse>(
    () => client.get(`/content/packages/${packageId}/analysis`).then((res) => res.data),
    `/content/packages/${packageId}/analysis`,
    undefined,
    30000
  );
}

export async function getPackageDetail(packageId: string): Promise<PackageDetailResponse> {
  return cachedGet(
    () => client.get(`/content/packages/${packageId}/detail`).then((res) => res.data),
    `/content/packages/${packageId}/detail`,
    undefined,
    30000
  );
}

export async function getCategories(params: { areaId?: string; role?: string } = {}) {
  return cachedGet<CategoriesResponse>(
    () => client.get('/content/packages/categories', { params }).then((res) => res.data),
    '/content/packages/categories',
    params,
    60000
  );
}
