import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';
import { ElMessage } from 'element-plus';
import { exponentialBackoff, sleep } from '@content/shared';
import { useAuthStore } from '../stores/auth';
import {
  extractErrorMessage,
  isAuthEndpoint,
  isRequestCanceled,
  MAX_RETRIES,
  requestKey,
  releaseInFlightController,
  restoreAuth,
  RETRY_DELAY,
  shouldRetry,
  statusErrorMessage,
  type RetryableConfig
} from './http-client-utils';

export async function retryWithRestoredAuth(params: {
  config: RetryableConfig;
  client: AxiosInstance;
  error: AxiosError;
  redirectToLogin: () => void;
  getAuthRestoreInflight: () => Promise<boolean | null> | null;
  setAuthRestoreInflight: (value: Promise<boolean | null> | null) => void;
}): Promise<unknown> {
  params.config.__authRetried__ = true;
  if (!params.getAuthRestoreInflight()) params.setAuthRestoreInflight(restoreAuth());
  try {
    const authenticated = await params.getAuthRestoreInflight();
    if (authenticated) {
      return params.client(params.config);
    }
    ElMessage.error('自动登录失败，请手动登录');
    useAuthStore().clearAuth();
    params.redirectToLogin();
    return Promise.reject(params.error);
  } finally {
    setTimeout(() => params.setAuthRestoreInflight(null), 100);
  }
}

export async function handleAuthError(params: {
  status: number;
  config?: RetryableConfig;
  client: AxiosInstance;
  error: AxiosError;
  redirectToLogin: () => void;
  getAuthRestoreInflight: () => Promise<boolean | null> | null;
  setAuthRestoreInflight: (value: Promise<boolean | null> | null) => void;
  isRedirecting: () => boolean;
}): Promise<unknown | undefined> {
  if (params.status === 401 && params.config && !params.config.__authRetried__)
    return retryWithRestoredAuth(params as never);
  if (params.status === 401) {
    if (!params.isRedirecting()) {
      ElMessage.error('未授权，请重新登录');
      useAuthStore().clearAuth();
      params.redirectToLogin();
    }
    return Promise.reject(params.error);
  }
  return undefined;
}

export async function maybeRetryHttpRequest(params: {
  error: AxiosError;
  client: AxiosInstance;
  inFlightControllers: Map<string, AbortController>;
  endProgress: () => void;
}): Promise<unknown | undefined> {
  const { error, client, inFlightControllers, endProgress } = params;
  endProgress();
  // Drop the slot only when this error still owns it (newer call may already
  // have replaced the controller for the same method+url key).
  if (error.config) releaseInFlightController(inFlightControllers, error.config);
  const config = error.config as RetryableConfig | undefined;
  // Stale request aborted by a newer call to the same endpoint — silent.
  if (isRequestCanceled(error) || axios.isCancel(error)) return Promise.reject(error);
  if (config && shouldRetry(error) && (config.retryCount ?? 0) < MAX_RETRIES) {
    config.retryCount = (config.retryCount ?? 0) + 1;
    await sleep(exponentialBackoff(config.retryCount - 1, RETRY_DELAY, RETRY_DELAY * 8));
    if (config.retryCount > 1) ElMessage.info(`正在重试... (${config.retryCount}/${MAX_RETRIES})`);
    return client(config);
  }
  if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
    if (!config?.url?.includes('/gmv/')) {
      ElMessage.error('请求超时。首次同步 JeeSite 全量库存可能较慢，请稍后重试');
    }
    return Promise.reject(error);
  }
  if (!error.response) {
    if (!config?.url?.includes('/gmv/')) {
      ElMessage.error(error.request ? '网络连接失败，请检查网络' : '请求配置错误');
    }
    return Promise.reject(error);
  }
  return undefined;
}

export function handleHttpStatusError(error: AxiosError): Promise<never> {
  const status = error.response?.status ?? 0;
  const data = error.response?.data as { message?: string; error?: string } | undefined;
  const config = error.config as RetryableConfig | undefined;
  // GMV API 的限流/超时由 refreshGmvCockpit / loadGmvValue 统一处理，不重复弹 toast
  const isGmvApi = config?.url?.includes('/gmv/');
  const isThrottler = data?.message?.includes('ThrottlerException');
  if (!isGmvApi && !isThrottler && !config?.__silentError__) {
    const message = data?.message || data?.error || '';
    const statusMessage = statusErrorMessage(status, message);
    if (statusMessage) ElMessage.error(statusMessage);
  }
  return Promise.reject(error);
}

export async function downloadBlobWithClient(
  client: AxiosInstance,
  url: string,
  filename: string
): Promise<void> {
  const response = await client.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(blobUrl);

  // Residual #262: CSV_EXPORT_MAX_ROWS honesty — API sets X-Export-* when clipped.
  const headers = response.headers ?? {};
  const truncated =
    String(headers['x-export-truncated'] ?? headers['X-Export-Truncated'] ?? '') === '1';
  if (truncated) {
    const limit = headers['x-export-limit'] ?? headers['X-Export-Limit'] ?? '1000';
    const total = headers['x-export-total'] ?? headers['X-Export-Total'];
    const totalHint = total ? `（匹配 ${total} 条）` : '';
    ElMessage.warning(`导出已截断为前 ${limit} 条${totalHint}，请缩小筛选条件后重试`);
  }
}

export async function handleHttpError(params: {
  error: AxiosError;
  client: AxiosInstance;
  inFlightControllers: Map<string, AbortController>;
  endProgress: () => void;
  redirectToLogin: () => void;
  getAuthRestoreInflight: () => Promise<boolean | null> | null;
  setAuthRestoreInflight: (value: Promise<boolean | null> | null) => void;
  isRedirecting: () => boolean;
}): Promise<unknown> {
  const {
    error,
    client,
    inFlightControllers,
    endProgress,
    redirectToLogin,
    getAuthRestoreInflight,
    setAuthRestoreInflight,
    isRedirecting
  } = params;
  const retryResult = await maybeRetryHttpRequest({
    error,
    client,
    inFlightControllers,
    endProgress
  });
  if (retryResult !== undefined) return retryResult;
  const authResult = await handleAuthError({
    status: error.response!.status,
    config: error.config as never,
    client,
    error,
    redirectToLogin,
    getAuthRestoreInflight,
    setAuthRestoreInflight,
    isRedirecting
  });
  if (authResult !== undefined) return authResult;
  return handleHttpStatusError(error);
}

export function attachHttpRequestInterceptor(args: {
  client: AxiosInstance;
  inFlightControllers: Map<string, AbortController>;
  startProgress: () => void;
  endProgress: () => void;
}) {
  const { client, inFlightControllers, startProgress, endProgress } = args;
  client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      startProgress();
      if (!isAuthEndpoint(config.url)) {
        await useAuthStore().ensureAuthenticated();
      }
      const method = config.method?.toUpperCase();
      if (['POST', 'PUT', 'PATCH'].includes(method ?? '')) {
        const headers = config.headers as Record<string, unknown>;
        if (!headers['Idempotency-Key'] && !headers['idempotency-key']) {
          headers['Idempotency-Key'] =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `idem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        }
      }
      const method = config.method?.toUpperCase();
      if (['POST', 'PUT', 'PATCH'].includes(method ?? '')) {
        const headers = config.headers as Record<string, unknown>;
        if (!headers['Idempotency-Key'] && !headers['idempotency-key']) {
          headers['Idempotency-Key'] =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `idem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        }
      }
      const retryConfig = config as RetryableConfig;
      if (!retryConfig.__authRetried__) {
        const key = requestKey(config),
          prev = inFlightControllers.get(key);
        if (prev && !prev.signal.aborted) prev.abort();
        const controller = new AbortController();
        inFlightControllers.set(key, controller);
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
}

export function attachHttpInterceptors(args: {
  client: AxiosInstance;
  inFlightControllers: Map<string, AbortController>;
  startProgress: () => void;
  endProgress: () => void;
  redirectToLogin: () => void;
  getAuthRestoreInflight: () => Promise<boolean | null> | null;
  setAuthRestoreInflight: (value: Promise<boolean | null> | null) => void;
  isRedirecting: () => boolean;
}) {
  const {
    client,
    inFlightControllers,
    startProgress,
    endProgress,
    redirectToLogin,
    getAuthRestoreInflight,
    setAuthRestoreInflight,
    isRedirecting
  } = args;
  attachHttpRequestInterceptor({ client, inFlightControllers, startProgress, endProgress });
  client.interceptors.response.use(
    (response) => {
      endProgress();
      releaseInFlightController(inFlightControllers, response.config);
      return response;
    },
    async (error: AxiosError) =>
      handleHttpError({
        error,
        client,
        inFlightControllers,
        endProgress,
        redirectToLogin,
        getAuthRestoreInflight,
        setAuthRestoreInflight,
        isRedirecting
      })
  );
}
