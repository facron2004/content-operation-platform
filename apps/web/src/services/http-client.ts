import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';
import { useAuthStore } from '../stores/auth';

// ==================== NProgress 配置 ====================
NProgress.configure({
  showSpinner: false,
  trickleSpeed: 200,
  minimum: 0.1
});

// ==================== HTTP 客户端 ====================

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 30000
});

// 请求计数器 (用于管理进度条)
let requestCount = 0;

// Prevent concurrent 401 redirects
let isRedirectingToLogin = false;

// ==================== 自动重试配置 ====================
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 初始延迟 1 秒

// 扩展 axios 配置，添加重试计数
type RetryableConfig = InternalAxiosRequestConfig & { retryCount?: number };

// 判断是否应该重试
function shouldRetry(error: AxiosError): boolean {
  // 网络错误或 5xx 错误应该重试
  if (!error.response) return true;
  const status = error.response.status;
  return status >= 500 && status < 600;
}

// 延迟函数
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

client.interceptors.request.use(
  (config) => {
    // 开始请求时显示进度条
    if (requestCount === 0) {
      NProgress.start();
    }
    requestCount++;

    // Inject auth token
    const authStore = useAuthStore();
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`;
    }

    // 添加重试配置
    const retryConfig = config as RetryableConfig;
    retryConfig.retryCount = retryConfig.retryCount ?? 0;

    return config;
  },
  (error) => {
    requestCount--;
    if (requestCount === 0) {
      NProgress.done();
    }
    ElMessage.error('请求发送失败');
    return Promise.reject(error);
  }
);

client.interceptors.response.use(
  (response) => {
    // 请求成功时隐藏进度条
    requestCount--;
    if (requestCount === 0) {
      NProgress.done();
    }
    return response;
  },
  async (error: AxiosError) => {
    requestCount--;
    if (requestCount === 0) {
      NProgress.done();
    }

    const config = error.config as RetryableConfig | undefined;

    // 自动重试逻辑
    if (config && shouldRetry(error) && (config.retryCount ?? 0) < MAX_RETRIES) {
      config.retryCount = (config.retryCount ?? 0) + 1;
      const retryDelay = RETRY_DELAY * Math.pow(2, config.retryCount - 1); // 指数退避

      console.log(`请求失败，${retryDelay}ms 后进行第 ${config.retryCount} 次重试...`);

      await delay(retryDelay);

      // 显示重试提示
      if (config.retryCount > 1) {
        ElMessage.info(`正在重试... (${config.retryCount}/${MAX_RETRIES})`);
      }

      return client(config);
    }

    // 重试失败或不需要重试，显示错误
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      ElMessage.error('请求超时。首次同步 JeeSite 全量库存可能较慢，请稍后重试');
    } else if (error.response) {
      const status = error.response.status;
      const data = error.response.data as { message?: string; error?: string } | undefined;
      const message = data?.message || data?.error;
      switch (status) {
        case 400:
          ElMessage.error(message || '请求参数错误');
          break;
        case 401:
          ElMessage.error('未授权，请重新登录');
          // Clear auth and redirect to login (deduplicated)
          useAuthStore().clearAuth();
          if (!isRedirectingToLogin) {
            isRedirectingToLogin = true;
            setTimeout(() => { isRedirectingToLogin = false; }, 500);
            window.location.hash = '#/login';
          }
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
          ElMessage.error('服务暂时不可用，请稍后重试');
          break;
        default:
          ElMessage.error(message || `请求失败 (${status})`);
      }
    } else if (error.request) {
      ElMessage.error('网络连接失败，请检查网络');
    } else {
      ElMessage.error('请求配置错误');
    }
    return Promise.reject(error);
  }
);

export default client;
