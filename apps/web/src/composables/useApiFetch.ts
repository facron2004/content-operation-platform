import { ref } from 'vue';
import { extractErrorMessage } from '../services/http-client';

export interface UseApiFetchOptions {
  errorMessage?: string;
  clearCacheOnForce?: boolean;
  cacheKeyPattern?: string;
}

export function useApiFetch<T>(fetcher: () => Promise<T>, options: UseApiFetchOptions = {}) {
  const { errorMessage = '数据加载失败，请稍后重试', clearCacheOnForce = true } = options;
  const loading = ref(false),
    data = ref<T | null>(null) as { value: T | null };
  const error = ref<string | null>(null);

  async function load(force = false) {
    loading.value = true;
    error.value = null;
    try {
      if (force && clearCacheOnForce) {
        const { clearCache } = await import('../services/cache.service');
        clearCache(options.cacheKeyPattern);
      }
      data.value = await fetcher();
    } catch (err) {
      error.value = extractErrorMessage(err, errorMessage);
    } finally {
      loading.value = false;
    }
  }

  return { loading, data, error, load };
}
