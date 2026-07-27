import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Avoid real DNS on same-host hop — assertHostnameNotPrivateAsync is a pure guard here.
vi.mock('../src/content/jeesite-url', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/content/jeesite-url')>();
  return {
    ...actual,
    assertHostnameNotPrivateAsync: vi.fn(async () => undefined)
  };
});

import { fetchOrderPage } from '../src/gmv/gmv-refresh';

describe('fetchOrderPage same-host redirect pin', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('follows a single same-host redirect and re-sends Cookie', async () => {
    const origin = new URL('https://jeesite.example/bargain/bargainOrder/listData');
    const hop = new URL('https://jeesite.example/bargain/bargainOrder/listData/');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 302,
        ok: false,
        headers: { get: (k: string) => (k === 'location' ? hop.toString() : null) },
        text: async () => ''
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({ list: [] })
      });
    globalThis.fetch = fetchMock as never;

    const payload = await fetchOrderPage(origin, 'session=abc');
    expect(payload).toEqual({ list: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect((secondInit.headers as Record<string, string>).Cookie).toBe('session=abc');
    expect(secondInit.redirect).toBe('manual');
  });

  it('does not follow off-host redirects (Cookie stays on origin hop)', async () => {
    const origin = new URL('https://jeesite.example/bargain/bargainOrder/listData');
    const fetchMock = vi.fn().mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: {
        get: (k: string) => (k === 'location' ? 'https://evil.example/steal' : null)
      },
      text: async () => 'redirect'
    });
    globalThis.fetch = fetchMock as never;

    await expect(fetchOrderPage(origin, 'session=abc')).rejects.toThrow(/JeSite HTTP 302/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
