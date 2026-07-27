import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosError } from 'axios';

vi.mock('../router', () => ({
  router: { push: vi.fn(() => Promise.resolve()) }
}));
vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    ensureAuthenticated: vi.fn(),
    refresh: vi.fn(),
    loginLocally: vi.fn(),
    clearAuth: vi.fn()
  })
}));

import { isRequestCanceled, requestKey, responseKey, shouldRetry } from './http-client-utils';

function fakeError(partial: Partial<AxiosError> & { name?: string; code?: string }): AxiosError {
  return {
    isAxiosError: true,
    toJSON: () => ({}),
    name: 'AxiosError',
    message: 'error',
    ...partial
  } as AxiosError;
}

describe('requestKey / responseKey', () => {
  it('keys by method+url only so date param changes share one in-flight slot', () => {
    const a = requestKey({ method: 'GET', url: '/data-analysis/summary' });
    const b = requestKey({
      method: 'get',
      url: '/data-analysis/summary'
    });
    expect(a).toBe(b);
    expect(responseKey({ method: 'GET', url: '/data-analysis/summary' })).toBe(a);
  });
});

describe('isRequestCanceled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects ERR_CANCELED / CanceledError / AbortError', () => {
    expect(isRequestCanceled({ code: 'ERR_CANCELED', name: 'CanceledError' })).toBe(true);
    expect(isRequestCanceled({ name: 'AbortError', message: 'The operation was aborted.' })).toBe(
      true
    );
    expect(isRequestCanceled({ message: 'canceled' })).toBe(true);
    expect(
      isRequestCanceled({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' })
    ).toBe(false);
    expect(isRequestCanceled(null)).toBe(false);
  });
});

describe('shouldRetry', () => {
  it('never retries canceled requests', () => {
    const err = fakeError({
      code: 'ERR_CANCELED',
      name: 'CanceledError',
      message: 'canceled',
      config: { method: 'get', url: '/x' } as never
    });
    expect(shouldRetry(err)).toBe(false);
  });
});
