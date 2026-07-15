import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';
import {
  exponentialBackoff,
  extractErrorMessage as extractErrorMessageBase,
  sleep
} from '@content/shared';
import { router } from '../router';
import { useAuthStore } from '../stores/auth';

NProgress.configure({
  showSpinner: false,
  trickleSpeed: 200,
  minimum: 0.1
});

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 30000
});

let requestCount = 0;
let isRedirectingToLogin = false;
let authRestoreInflight: Promise<string | null> | null = null;
const inFlightControllers = new Map<string, AbortController>();

type RetryableConfig = InternalAxiosRequestConfig & {
  retryCount?: number;
  __authRetried__?: boolean;
};

function startProgress() {
  if (requestCount === 0) NProgress.start();
  requestCount++;
}

function endProgress() {
  requestCount = Math.max(0, requestCount - 1);
  if (requestCount === 0) NProgress.done();
}

function isAuthEndpoint(url?: string): boolean {
  if (!url) return false;
  // 严格匹配:必须以 /auth/ 或 auth/ 开头;避免 /author/* 误判
  const normalized = url.startsWith('/') ? url : `/${url}`;
  return /^\/auth(\/|$)/.test(normalized);
}

/** 是否为可重试错误:取消不算(CanceledError 是用户/组件主动取消,不是服务器瞬态故障),
 *  网络层无响应 + 5xx 算服务器端瞬态失败,可以重试。 */
function shouldRetry(error: AxiosError): boolean {
  if (axios.isCancel(error)) return false;
  if (error.code === 'ERR_CANCELED' || (error as { name?: string }).name === 'CanceledError') {
    return false;
  }
  if (!error.response) return true;
  const status = error.response.status;
  return status >= 500 && status < 600;
}

async function restoreAuth(): Promise<string | null> {
  const authStore = useAuthStore();
  const refreshed = await authStore.refresh();
  if (refreshed) return refreshed;
  return authStore.loginLocally();
}

/** 从任意错误对象中抽取可展示给用户的字符串(axios 友好版)。
 *  优先读 axios 响应体里的 message / error,再退到 Error.message,
 *  最后用 fallback。实现已下沉到 packages/shared,这里只包一层默认 isAxiosError 判别,
 *  保持调用点 `extractErrorMessage(error)` 的简洁签名不变。 */
export function extractErrorMessage(error: unknown, fallback = '请求失败'): string {
  return extractErrorMessageBase(error, { isAxiosError: axios.isAxiosError, fallback });
}

function abortAllInflight() {
  for (const [, ctrl] of inFlightControllers) {
    try {
      ctrl.abort();
    } catch {
      // 忽略: abort 失败不影响清理
    }
  }
  inFlightControllers.clear();
}

function redirectToLogin() {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;
  // 跳登录前清掉所有在飞请求,避免页面卸载后响应回来触发 store 副作用
  abortAllInflight();
  router.push({ name: 'login' }).finally(() => {
    setTimeout(() => {
      isRedirectingToLogin = false;
    }, 500);
  });
}

function setAuthorization(config: InternalAxiosRequestConfig, token: string) {
  config.headers = config.headers ?? ({} as InternalAxiosRequestConfig['headers']);
  (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

client.interceptors.request.use(
  async (config) => {
    startProgress();

    if (!isAuthEndpoint(config.url)) {
      const token = await useAuthStore().ensureAuthenticated();
      if (token) setAuthorization(config, token);
    }

    // P2-8: AbortController — 同 URL 同 method 的在飞请求互相取消,避免页面抖动时
    // 旧请求覆盖新请求的视图。注意:只有"第一次"创建 key 时才 abort 上一个;
    // 标记了 __authRetried__ 的重试请求不参与 abort-替换,避免重试时把自己 abort 掉。
    const retryConfig = config as RetryableConfig;
    if (!retryConfig.__authRetried__) {
      const requestKey = `${config.method}:${config.url ?? ''}`;
      const prev = inFlightControllers.get(requestKey);
      if (prev && !prev.signal.aborted) prev.abort();
      const controller = new AbortController();
      inFlightControllers.set(requestKey, controller);
      config.signal = controller.signal;
    }

    retryConfig.retryCount = retryConfig.retryCount ?? 0;
    return config;
  },
  (error) => {
    endProgress();
    ElMessage.error(extractErrorMessage(error, '请求发送失败'));
    return Promise.reject(error);
  }
);

client.interceptors.response.use(
  (response) => {
    endProgress();
    // Clean up AbortController
    const key = `${response.config.method}:${response.config.url ?? ''}`;
    inFlightControllers.delete(key);
    return response;
  },
  async (error: AxiosError) => {
    endProgress();
    // Clean up AbortController(仅当不是用户主动取消)
    if (error.config && !axios.isCancel(error)) {
      const key = `${error.config.method}:${error.config.url ?? ''}`;
      inFlightControllers.delete(key);
    }

    const config = error.config as RetryableConfig | undefined;

    // 用户主动取消:不重试、不弹错
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    if (config && shouldRetry(error) && (config.retryCount ?? 0) < MAX_RETRIES) {
      config.retryCount = (config.retryCount ?? 0) + 1;
      const retryDelay = exponentialBackoff(config.retryCount - 1, RETRY_DELAY, RETRY_DELAY * 8);
      await sleep(retryDelay);
      if (config.retryCount > 1) {
        ElMessage.info(`正在重试... (${config.retryCount}/${MAX_RETRIES})`);
      }
      return client(config);
    }

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      ElMessage.error('请求超时。首次同步 JeeSite 全量库存可能较慢，请稍后重试');
      return Promise.reject(error);
    }

    if (!error.response) {
      if (error.request) ElMessage.error('网络连接失败，请检查网络');
      else ElMessage.error('请求配置错误');
      return Promise.reject(error);
    }

    const status = error.response.status;
    const data = error.response.data as { message?: string; error?: string } | undefined;
    const message = data?.message || data?.error || '';

    if (status === 401 && config && !config.__authRetried__) {
      config.__authRetried__ = true;
      if (!authRestoreInflight) authRestoreInflight = restoreAuth();
      try {
        const token = await authRestoreInflight;
        if (token) {
          setAuthorization(config, token);
          return client(config);
        }
        // 自动登录失败
        ElMessage.error('自动登录失败，请手动登录');
        useAuthStore().clearAuth();
        redirectToLogin();
        return Promise.reject(error);
      } finally {
        // 无论成功失败,释放 in-flight 锁;并发 401 复用同一 promise
        setTimeout(() => {
          authRestoreInflight = null;
        }, 100);
      }
    }

    // 401 重试后再次 401,或 401 且无 config(异常路径):清理 + 跳登录,只弹一次
    if (status === 401) {
      if (!isRedirectingToLogin) {
        ElMessage.error('未授权，请重新登录');
        useAuthStore().clearAuth();
        redirectToLogin();
      }
      return Promise.reject(error);
    }

    switch (status) {
      case 400:
        ElMessage.error(message || '请求参数错误');
        break;
      case 403:
        ElMessage.error('没有权限访问该资源');
        break;
      case 404:
        ElMessage.error('请求的资源不存在');
        break;
      case 500:
        ElMessage.error(message || '服务器内部错误');
        break;
      case 502:
      case 503:
        ElMessage.error(message || '服务暂时不可用，请稍后重试');
        break;
      default:
        ElMessage.error(message || `请求失败 (${status})`);
    }

    return Promise.reject(error);
  }
);

export default client;
