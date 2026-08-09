import { afterEach, describe, expect, it, vi } from 'vitest';
import { GmvService } from '../src/gmv/gmv.service';

describe('GmvService refreshFromJeesite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reuses the current cookie and renews it once when JeeSite reports login', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 'login' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ list: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const autoLogin = {
      ensureValidCookie: vi
        .fn()
        .mockResolvedValueOnce('current-cookie')
        .mockResolvedValueOnce('renewed-cookie'),
      clearCache: vi.fn()
    };
    const prisma = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ gmv: 0 }]),
      orderHeader: { upsert: vi.fn() }
    };
    const service = new GmvService(prisma as never, autoLogin as never);

    const result = await service.refreshFromJeesite('2026-07-15', '2026-07-15');

    expect(result.fetched).toBe(0);
    expect(autoLogin.ensureValidCookie).toHaveBeenNthCalledWith(1);
    expect(autoLogin.ensureValidCookie).toHaveBeenNthCalledWith(2, true);
    expect(autoLogin.clearCache).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)['x-ajax']).toBe('json');
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Cookie).toBe(
      'renewed-cookie'
    );
  });

  it('reports an external pull warning when refresh falls back to local recompute', async () => {
    const previousBaseUrl = process.env.EXTERNAL_API_BASE_URL;
    const previousCookie = process.env.EXTERNAL_API_COOKIE;
    process.env.EXTERNAL_API_BASE_URL = 'https://1.1.1.1/a';
    process.env.EXTERNAL_API_COOKIE = 'test-cookie';
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const prisma = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ gmv: 0 }])
      };
      const service = new GmvService(prisma as never);

      const result = await service.refreshFromJeesite('2026-07-15', '2026-07-15');

      expect(result.pullWarnings).toEqual(['JeSite pull failed: network down']);
      expect(result.recomputeWarnings).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      if (previousBaseUrl === undefined) delete process.env.EXTERNAL_API_BASE_URL;
      else process.env.EXTERNAL_API_BASE_URL = previousBaseUrl;
      if (previousCookie === undefined) delete process.env.EXTERNAL_API_COOKIE;
      else process.env.EXTERNAL_API_COOKIE = previousCookie;
    }
  });
});
