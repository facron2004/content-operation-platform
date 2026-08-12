import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';
import { extractErrorMessage as extractErrorMessageBase } from '@content/shared';
import { useAuthStore } from '../stores/auth';
import { router } from '../router';

type RequestKeyConfig = { method?: string; url?: string; params?: unknown };

function stableParamValue(value: unknown): string {
  if (value === null) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableParamValue).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableParamValue(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function paramsKey(params: unknown): string {
  if (params == null) return '';
  if (typeof URLSearchParams !== 'undefined' && params instanceof URLSearchParams) {
    return params.toString();
  }
  return stableParamValue(params);
}

/**
 * In-flight de-dupe key: method + url + a stable representation of params.
 * Requests for different filters/date windows must not cancel each other;
 * repeated requests for the same query still share one slot.
 */
export function requestKey(config: RequestKeyConfig): string {
  const params = paramsKey(config.params);
  return `${(config.method ?? 'get').toLowerCase()}:${config.url ?? ''}${params ? `?${params}` : ''}`;
}
export function responseKey(config: RequestKeyConfig): string {
  return requestKey(config);
}

/** Remove an in-flight slot only when the settling response still owns it. */
export function releaseInFlightController(
  inFlightControllers: Map<string, AbortController>,
  config: RequestKeyConfig & { signal?: unknown }
): void {
  const key = responseKey(config);
  const owner = inFlightControllers.get(key);
  if (owner && owner.signal === config.signal) inFlightControllers.delete(key);
}

/** True for AbortController / axios cancel — not a real network failure. */
export function isRequestCanceled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if (axios.isCancel(error)) return true;
  const e = error as { code?: string; name?: string; message?: string };
  if (e.code === 'ERR_CANCELED' || e.name === 'CanceledError' || e.name === 'AbortError') {
    return true;
  }
  // DOMException / legacy AbortError message shapes
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  return msg === 'canceled' || msg === 'cancelled' || msg.includes('aborted');
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
  /** Suppress error toasts — caller handles the error itself. */
  __silentError__?: boolean;
};
export const MAX_RETRIES = 3,
  RETRY_DELAY = 1000;
export function isAuthEndpoint(url?: string): boolean {
  return !!url && /^\/auth(\/|$)/.test(url.startsWith('/') ? url : `/${url}`);
}
export function shouldRetry(error: AxiosError): boolean {
  if (isRequestCanceled(error)) return false;
  const method = error.config?.method?.toLowerCase();
  if (method && !['get', 'head', 'options'].includes(method)) return false;
  const s = error.response?.status;
  // Server errors only (5xx) — timeouts and rate limits fail fast
  return s != null && s >= 500 && s < 600;
}
export async function restoreAuth(): Promise<boolean | null> {
  const a = useAuthStore();
  return (await a.refresh()) || a.loginLocally();
}
export function extractErrorMessage(error: unknown, fallback = '请求失败'): string {
  return extractErrorMessageBase(error, { isAxiosError: axios.isAxiosError, fallback });
}
