import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';
import { extractErrorMessage as extractErrorMessageBase } from '@content/shared';
import { useAuthStore } from '../stores/auth';
import { router } from '../router';

export function requestKey(config: { method?: string; url?: string; params?: unknown }): string {
  const paramsKey = config.params ? JSON.stringify(config.params) : '';
  return `${config.method}:${config.url ?? ''}?${paramsKey}`;
}
export function responseKey(config: { method?: string; url?: string }): string {
  return `${config.method}:${config.url ?? ''}`;
}

export function statusErrorMessage(status: number, message: string): string | null {
  switch (status) {
    case 400:
      return message || '请求参数错误';
    case 403:
      return '没有权限访问该资源';
    case 404:
      return '请求的资源不存在';
    case 500:
      return message || '服务器内部错误';
    case 502:
    case 503:
      return message || '服务暂时不可用，请稍后重试';
    default:
      return message || `请求失败 (${status})`;
  }
}

export function createProgressTracker() {
  let requestCount = 0;
  return {
    start(onStart: () => void) {
      if (requestCount === 0) onStart();
      requestCount++;
    },
    end(onDone: () => void) {
      requestCount = Math.max(0, requestCount - 1);
      if (requestCount === 0) onDone();
    }
  };
}
export function createLoginRedirector() {
  let isRedirectingToLogin = false;
  return {
    get isRedirecting() {
      return isRedirectingToLogin;
    },
    redirect(abortAll: () => void) {
      if (isRedirectingToLogin) return;
      isRedirectingToLogin = true;
      abortAll();
      router.push({ name: 'login' }).finally(() => {
        setTimeout(() => {
          isRedirectingToLogin = false;
        }, 500);
      });
    }
  };
}

export type RetryableConfig = InternalAxiosRequestConfig & {
  retryCount?: number;
  __authRetried__?: boolean;
};
export const MAX_RETRIES = 3,
  RETRY_DELAY = 1000;
export function isAuthEndpoint(url?: string): boolean {
  return !!url && /^\/auth(\/|$)/.test(url.startsWith('/') ? url : `/${url}`);
}
export function shouldRetry(error: AxiosError): boolean {
  if (
    axios.isCancel(error) ||
    error.code === 'ERR_CANCELED' ||
    (error as { name?: string }).name === 'CanceledError'
  )
    return false;
  const method = error.config?.method?.toLowerCase();
  if (method && !['get', 'head', 'options'].includes(method)) return false;
  const s = error.response?.status;
  return s == null || (s >= 500 && s < 600);
}
export async function restoreAuth(): Promise<string | null> {
  const a = useAuthStore();
  return (await a.refresh()) || a.loginLocally();
}
export function extractErrorMessage(error: unknown, fallback = '请求失败'): string {
  return extractErrorMessageBase(error, { isAxiosError: axios.isAxiosError, fallback });
}
export function setAuthorization(config: InternalAxiosRequestConfig, token: string) {
  config.headers = config.headers ?? ({} as InternalAxiosRequestConfig['headers']);
  (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
}
