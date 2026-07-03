// ==================== 请求缓存 ====================

const MAX_CACHE_ENTRIES = 200; // LRU: evict oldest entries beyond this limit
const MAX_PENDING_ENTRIES = 50; // Prevent pending request Map from growing unbounded

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const pendingRequests = new Map<string, Promise<unknown>>();

function getCacheKey(url: string, params?: Record<string, unknown>): string {
  // Filter undefined/null so {areaId: undefined} and {} produce the same key —
  // 否则 { areaId: undefined } 会被 stringify 成 "{\"areaId\":undefined}",与省略键不一致。
  const cleaned = params
    ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null))
    : {};
  const sortedParams = Object.fromEntries(Object.entries(cleaned).sort());
  return `${url}:${JSON.stringify(sortedParams)}`;
}

/** Evict the oldest entries when Map exceeds max size (LRU-like) */
function evictIfNeeded<V>(map: Map<string, V>, maxSize: number): void {
  while (map.size > maxSize) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
}

export async function cachedGet<T>(
  fetcher: () => Promise<T>,
  url: string,
  params?: Record<string, unknown>,
  ttl = 60000
): Promise<T> {
  const cacheKey = getCacheKey(url, params);
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    // Refresh access order for LRU
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);
    return cached.data as T;
  }

  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending as Promise<T>;

  const request = fetcher()
    .then((data) => {
      cache.set(cacheKey, { data, expiresAt: now + ttl });
      evictIfNeeded(cache, MAX_CACHE_ENTRIES);
      pendingRequests.delete(cacheKey);
      return data;
    })
    .catch((error) => {
      pendingRequests.delete(cacheKey);
      throw error;
    });

  evictIfNeeded(pendingRequests, MAX_PENDING_ENTRIES);
  pendingRequests.set(cacheKey, request);
  return request;
}

export function clearCache(pattern?: string) {
  if (pattern) {
    // Targeted invalidation: only clear keys matching the URL pattern
    for (const key of cache.keys()) {
      if (key.includes(pattern)) cache.delete(key);
    }
  } else {
    cache.clear();
    pendingRequests.clear();
  }
}

/** Invalidate only package/recommendation related cache entries */
export function clearPackageCache() {
  clearCache('/packages');
  clearCache('/recommend');
  clearCache('/battle');
  clearCache('/categories');
  clearCache('/recommendations');
}

/** Invalidate only alert related cache entries */
export function clearAlertCache() {
  clearCache('/alerts');
}

/** Invalidate dashboard console cache */
export function clearDashboardCache() {
  clearCache('/ops/today');
  clearCache('/dashboard');
  clearCache('/performance');
}

export function deleteCacheKey(url: string, params?: Record<string, unknown>) {
  const cacheKey = getCacheKey(url, params);
  cache.delete(cacheKey);
}
