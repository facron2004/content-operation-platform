import { ref, onMounted } from 'vue';
import { api } from '../services/api';

/**
 * 通用数据加载 composable — 消除各视图中重复的 loading/error/force-refresh 模式。
 *
 * 用法:
 *   const { loading, data, error, load } = useApiFetch(() => api.getPerformance());
 *   onMounted(() => load());
 */
export function useApiFetch<T>(fetcher: () => Promise<T>) {
  const loading = ref(false);
  const data = ref<T | null>(null);
  const error = ref<string | null>(null);

  async function load(force = false) {
    loading.value = true;
    error.value = null;
    try {
      if (force) api.clearCache();
      data.value = await fetcher();
    } catch (e: unknown) {
      error.value = '数据加载失败，请稍后重试';
    } finally {
      loading.value = false;
    }
  }

  return { loading, data, error, load };
}
