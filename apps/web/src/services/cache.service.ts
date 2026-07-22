const MAX_CACHE_ENTRIES = 200,
  MAX_PENDING_ENTRIES = 50;

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const pendingRequests = new Map<string, Promise<unknown>>();

export function getCacheKey(url: string, params?: Record<string, unknown>): string {
  const cleaned = params
    ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null))
    : {};
  return `${url}:${JSON.stringify(Object.fromEntries(Object.entries(cleaned).sort()))}`;
}

function evictIfNeeded<V>(map: Map<string, V>, maxSize: number): void {
  while (map.size > maxSize) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
}

export function clearCache(pattern?: string) {
  if (!pattern) {
    cache.clear();
    pendingRequests.clear();
    return;
  }
  for (const key of cache.keys()) if (key.includes(pattern)) cache.delete(key);
  // Also drop matching in-flight requests so a late resolve cannot repopulate stale data
  for (const key of pendingRequests.keys()) if (key.includes(pattern)) pendingRequests.delete(key);
}

export function deleteCacheKey(url: string, params?: Record<string, unknown>) {
  cache.delete(getCacheKey(url, params));
}

export async function cachedGet<T>(
  fetcher: () => Promise<T>,
  url: string,
  params?: Record<string, unknown>,
  ttl = 60000
): Promise<T> {
  const cacheKey = getCacheKey(url, params),
    now = Date.now(),
    cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);
    return cached.data as T;
  }
  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending as Promise<T>;
  const request = fetcher()
    .then((data) => {
      // Only write back if this request is still the active pending entry
      // (pattern clear may have dropped it to avoid stale repopulation)
      if (pendingRequests.get(cacheKey) === request) {
        cache.set(cacheKey, { data, expiresAt: now + ttl });
        evictIfNeeded(cache, MAX_CACHE_ENTRIES);
        pendingRequests.delete(cacheKey);
      }
      return data;
    })
    .catch((error) => {
      if (pendingRequests.get(cacheKey) === request) pendingRequests.delete(cacheKey);
      throw error;
    });
  evictIfNeeded(pendingRequests, MAX_PENDING_ENTRIES);
  pendingRequests.set(cacheKey, request);
  return request;
}

export function clearPackageCache() {
  clearCache('/packages');
  clearCache('/recommend');
  clearCache('/battle');
  clearCache('/categories');
  clearCache('/recommendations');
}

export function clearAlertCache() {
  clearCache('/alerts');
}

export function clearDashboardCache() {
  clearCache('/ops/today');
  clearCache('/dashboard');
  clearCache('/performance');
}
