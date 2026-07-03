import { ref } from 'vue';
import { api } from '../services/api';
import { extractErrorMessage } from '../services/http-client';

/**
 * 通用数据加载 composable — 消除各视图中重复的 loading/error/force-refresh 模式。
 *
 * 用法:
 *   const { loading, data, error, load } = useApiFetch(() => api.getPerformance());
 *   onMounted(() => load());
 *
 * 支持自定义错误消息:
 *   const { loading, data, error, load } = useApiFetch(() => api.getCommunities(), {
 *     errorMessage: '社群数据加载失败，请稍后重试',
 *   });
 */
export interface UseApiFetchOptions {
  /** 自定义错误提示，默认 '数据加载失败，请稍后重试' */
  errorMessage?: string;
  /** 是否在 force 时清除全局缓存，默认 true */
  clearCacheOnForce?: boolean;
}

export function useApiFetch<T>(fetcher: () => Promise<T>, options: UseApiFetchOptions = {}) {
  const { errorMessage = '数据加载失败，请稍后重试', clearCacheOnForce = true } = options;
  const loading = ref(false);
  const data = ref<T | null>(null) as { value: T | null };
  const error = ref<string | null>(null);

  async function load(force = false) {
    loading.value = true;
    error.value = null;
    try {
      if (force && clearCacheOnForce) api.clearCache();
      data.value = await fetcher();
    } catch (err) {
      // 真实错误从 axios 响应里抽,fallback 才是 errorMessage —— 让 UI 能区分"通用失败"与"具体 4xx"
      error.value = extractErrorMessage(err, errorMessage);
    } finally {
      loading.value = false;
    }
  }

  return { loading, data, error, load };
}
