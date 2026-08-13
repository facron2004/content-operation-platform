import { onScopeDispose, ref } from 'vue';
import { extractErrorMessage } from '../services/http-client';

export interface UseApiFetchOptions {
  errorMessage?: string;
  clearCacheOnForce?: boolean;
  cacheKeyPattern?: string;
}

export function useApiFetch<T>(
  fetcher: (force: boolean) => Promise<T>,
  options: UseApiFetchOptions = {}
) {
  const { errorMessage = '数据加载失败，请稍后重试', clearCacheOnForce = true } = options;
  const loading = ref(false),
    data = ref<T | null>(null) as { value: T | null };
  const error = ref<string | null>(null);
  let requestId = 0;
  let disposed = false;

  onScopeDispose(() => {
    disposed = true;
    requestId += 1;
    loading.value = false;
  }, true);

  async function load(force = false) {
    if (disposed) return;
    const currentRequestId = ++requestId;
    loading.value = true;
    error.value = null;
    try {
      if (force && clearCacheOnForce) {
        const { clearCache } = await import('../services/cache.service');
        if (disposed) return;
        clearCache(options.cacheKeyPattern);
      }
      const nextData = await fetcher(force);
      if (disposed || currentRequestId !== requestId) return;
      data.value = nextData;
    } catch (err) {
      if (disposed || currentRequestId !== requestId) return;
      error.value = extractErrorMessage(err, errorMessage);
    } finally {
      if (!disposed && currentRequestId === requestId) loading.value = false;
    }
  }

  return { loading, data, error, load };
}
