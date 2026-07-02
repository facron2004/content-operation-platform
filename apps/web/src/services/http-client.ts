import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';
import { exponentialBackoff, sleep } from '@content/shared';
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

function isAuthEndpoint(url?: string) {
  return !!url && /^\/?auth\//.test(url);
}

function shouldRetry(error: AxiosError): boolean {
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

/** 从任意错误对象中抽取可展示给用户的字符串。
 *  优先读 axios 响应体里的 message / error,再退到 Error.message,
 *  最后用 fallback。web 各处错误处理统一走这里,避免重复 isinstance 判断。 */
export function extractErrorMessage(error: unknown, fallback = '请求失败'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    const message = data?.message || data?.error;
    if (message) return message;
    if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message)) {
      return '请求超时,请稍后重试';
    }
    if (!error.response) return '网络连接失败,请检查网络';
    return `请求失败 (${error.response.status})`;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function redirectToLogin() {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;
  setTimeout(() => {
    isRedirectingToLogin = false;
  }, 500);
  window.location.hash = '#/login';
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

    const retryConfig = config as RetryableConfig;
    retryConfig.retryCount = retryConfig.retryCount ?? 0;
    return config;
  },
  (error) => {
    endProgress();
    ElMessage.error('请求发送失败');
    return Promise.reject(error);
  }
);

client.interceptors.response.use(
  (response) => {
    endProgress();
    return response;
  },
  async (error: AxiosError) => {
    endProgress();

    const config = error.config as RetryableConfig | undefined;
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
    const message = data?.message || data?.error;

    if (status === 401 && config && !config.__authRetried__) {
      config.__authRetried__ = true;
      if (!authRestoreInflight) authRestoreInflight = restoreAuth();
      const token = await authRestoreInflight;
      authRestoreInflight = null;

      if (token) {
        setAuthorization(config, token);
        return client(config);
      }

      ElMessage.error('自动登录失败，请手动登录');
      useAuthStore().clearAuth();
      redirectToLogin();
      return Promise.reject(error);
    }

    switch (status) {
      case 400:
        ElMessage.error(message || '请求参数错误');
        break;
      case 401:
        ElMessage.error('未授权，请重新登录');
        useAuthStore().clearAuth();
        redirectToLogin();
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
