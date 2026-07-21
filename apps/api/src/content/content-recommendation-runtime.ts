import type { RecommendPackageItem, RecommendQuery } from '@content/shared';

export interface CachedRecommendations {
  data: { date: string; areaId: string; packages: RecommendPackageItem[] };
  expiresAt: number;
}

export type RecommendationPayload = {
  date: string;
  areaId: string;
  packages: RecommendPackageItem[];
};

export function recommendationCacheKey(query: RecommendQuery): string {
  const parts: Record<string, string> = {};
  if (query.date) parts.date = query.date;
  if (query.areaId) parts.areaId = query.areaId;
  if (query.merchantId) parts.merchantId = query.merchantId;
  if (query.role) parts.role = query.role;
  if (query.status) parts.status = query.status;
  if (query.category) parts.category = query.category;
  if (query.inventoryMin !== undefined) parts.inventoryMin = String(query.inventoryMin);
  if (query.inventoryMax !== undefined) parts.inventoryMax = String(query.inventoryMax);
  if (query.inventoryFlag) parts.inventoryFlag = query.inventoryFlag;
  return JSON.stringify(parts);
}

export function pruneRecommendationCache(
  cache: Map<string, CachedRecommendations>,
  now: number,
  maxSize: number
): void {
  if (cache.size < maxSize) return;
  for (const [key, entry] of cache.entries()) if (entry.expiresAt <= now) cache.delete(key);
  while (cache.size >= maxSize) {
    const firstKey = cache.keys().next().value;
    if (!firstKey) break;
    cache.delete(firstKey);
  }
}

export function filterRecommendationItems(
  items: RecommendPackageItem[],
  query: RecommendQuery,
  isSellingPackage: (item: RecommendPackageItem) => boolean
): RecommendPackageItem[] {
  return items
    .filter((item) => isSellingPackage(item))
    .filter((item) => query.inventoryMin == null || item.stockLeft >= query.inventoryMin)
    .filter((item) => query.inventoryMax == null || item.stockLeft <= query.inventoryMax)
    .filter((item) => (query.inventoryFlag === 'unsold' ? item.inventoryFlag !== 'normal' : true));
}

function runRecommendationCompute(params: {
  cacheKey: string;
  query: RecommendQuery;
  cache: Map<string, CachedRecommendations>;
  inFlight: Map<string, Promise<RecommendationPayload>>;
  ttlMs: number;
  maxSize: number;
  now: number;
  compute: (query: RecommendQuery) => Promise<RecommendationPayload>;
}): Promise<RecommendationPayload> {
  const pending = params
    .compute(params.query)
    .then((data) => {
      pruneRecommendationCache(params.cache, params.now, params.maxSize);
      params.cache.set(params.cacheKey, { data, expiresAt: Date.now() + params.ttlMs });
      return data;
    })
    .finally(() => {
      params.inFlight.delete(params.cacheKey);
    });
  params.inFlight.set(params.cacheKey, pending);
  return pending;
}

async function getOrComputeRecommendations(params: {
  query: RecommendQuery;
  cache: Map<string, CachedRecommendations>;
  inFlight: Map<string, Promise<RecommendationPayload>>;
  ttlMs: number;
  maxSize: number;
  compute: (query: RecommendQuery) => Promise<RecommendationPayload>;
}): Promise<RecommendationPayload> {
  const cacheKey = recommendationCacheKey(params.query),
    now = Date.now(),
    cached = params.cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data;
  const pendingExisting = params.inFlight.get(cacheKey);
  if (pendingExisting) return pendingExisting;
  return runRecommendationCompute({
    cacheKey,
    query: params.query,
    cache: params.cache,
    inFlight: params.inFlight,
    ttlMs: params.ttlMs,
    maxSize: params.maxSize,
    compute: params.compute,
    now
  });
}

export function createRecommendationRuntime(
  compute: (query: RecommendQuery) => Promise<RecommendationPayload>
) {
  const cache = new Map<string, CachedRecommendations>();
  const inFlight = new Map<string, Promise<RecommendationPayload>>();
  const ttlMs = Number.parseInt(
    process.env.CONTENT_RECOMMENDATION_CACHE_TTL_MS ?? process.env.CONTENT_CACHE_TTL_MS ?? '60000',
    10
  );
  const maxSize = 50;
  return {
    invalidate: () => cache.clear(),
    getRecommendations: (query: RecommendQuery) =>
      getOrComputeRecommendations({ query, cache, inFlight, ttlMs, maxSize, compute })
  };
}
