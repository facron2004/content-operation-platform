import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';
import { ElMessage } from 'element-plus';
import { exponentialBackoff, sleep } from '@content/shared';
import { useAuthStore } from '../stores/auth';
import {
  extractErrorMessage,
  isAuthEndpoint,
  MAX_RETRIES,
  requestKey,
  responseKey,
  restoreAuth,
  RETRY_DELAY,
  setAuthorization,
  shouldRetry,
  statusErrorMessage,
  type RetryableConfig
} from './http-client-utils';

export async function retryWithRestoredAuth(params: {
  config: RetryableConfig;
  client: AxiosInstance;
  error: AxiosError;
  redirectToLogin: () => void;
  getAuthRestoreInflight: () => Promise<string | null> | null;
  setAuthRestoreInflight: (value: Promise<string | null> | null) => void;
}): Promise<unknown> {
  params.config.__authRetried__ = true;
  if (!params.getAuthRestoreInflight()) params.setAuthRestoreInflight(restoreAuth());
  try {
    const token = await params.getAuthRestoreInflight();
    if (token) {
      setAuthorization(params.config as InternalAxiosRequestConfig, token);
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
  getAuthRestoreInflight: () => Promise<string | null> | null;
  setAuthRestoreInflight: (value: Promise<string | null> | null) => void;
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
  if (error.config && !axios.isCancel(error)) inFlightControllers.delete(responseKey(error.config));
  const config = error.config as RetryableConfig | undefined;
  if (axios.isCancel(error)) return Promise.reject(error);
  if (config && shouldRetry(error) && (config.retryCount ?? 0) < MAX_RETRIES) {
    config.retryCount = (config.retryCount ?? 0) + 1;
    await sleep(exponentialBackoff(config.retryCount - 1, RETRY_DELAY, RETRY_DELAY * 8));
    if (config.retryCount > 1) ElMessage.info(`正在重试... (${config.retryCount}/${MAX_RETRIES})`);
    return client(config);
  }
  if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
    ElMessage.error('请求超时。首次同步 JeeSite 全量库存可能较慢，请稍后重试');
    return Promise.reject(error);
  }
  if (!error.response) {
    ElMessage.error(error.request ? '网络连接失败，请检查网络' : '请求配置错误');
    return Promise.reject(error);
  }
  return undefined;
}

export function handleHttpStatusError(error: AxiosError): Promise<never> {
  const status = error.response?.status ?? 0;
  const data = error.response?.data as { message?: string; error?: string } | undefined;
  const message = data?.message || data?.error || '';
  const statusMessage = statusErrorMessage(status, message);
  if (statusMessage) ElMessage.error(statusMessage);
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
}

export async function handleHttpError(params: {
  error: AxiosError;
  client: AxiosInstance;
  inFlightControllers: Map<string, AbortController>;
  endProgress: () => void;
  redirectToLogin: () => void;
  getAuthRestoreInflight: () => Promise<string | null> | null;
  setAuthRestoreInflight: (value: Promise<string | null> | null) => void;
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
        const token = await useAuthStore().ensureAuthenticated();
        if (token) setAuthorization(config, token);
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
  getAuthRestoreInflight: () => Promise<string | null> | null;
  setAuthRestoreInflight: (value: Promise<string | null> | null) => void;
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
      inFlightControllers.delete(responseKey(response.config));
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
