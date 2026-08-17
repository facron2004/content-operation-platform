import { afterEach, describe, expect, it, vi } from 'vitest';
import { JeeSiteDataSourceClient } from '../src/content/jeesite-data-source.client';

const previousEnv = {
  EXTERNAL_API_BASE_URL: process.env.EXTERNAL_API_BASE_URL,
  EXTERNAL_PACKAGES_PATH: process.env.EXTERNAL_PACKAGES_PATH
};

describe('JeeSiteDataSourceClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env.EXTERNAL_API_BASE_URL = previousEnv.EXTERNAL_API_BASE_URL;
    process.env.EXTERNAL_PACKAGES_PATH = previousEnv.EXTERNAL_PACKAGES_PATH;
  });

  it('surfaces external backend failures with a stable service error', async () => {
    process.env.EXTERNAL_API_BASE_URL = 'https://zdm.zhsh1.cn/a';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const client = new JeeSiteDataSourceClient({
      ensureValidCookie: vi.fn().mockResolvedValue(''),
      clearCache: vi.fn()
    } as any);

    await expect(client.loadDataset()).rejects.toThrow(/External backend request failed/i);
  });

  it('rebuilds fetch headers after auto login refreshes an expired cookie', async () => {
    process.env.EXTERNAL_API_BASE_URL = 'https://zdm.zhsh1.cn/a';
    process.env.EXTERNAL_PACKAGES_PATH = '/bargain/bargainCommodity/listData?pageSize=1&pageNo=1';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 'login' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            count: 1,
            pageSize: 1,
            list: [
              {
                id: 'PKG-REFRESH',
                commodityName: 'Refresh Cookie Package',
                bargainState: 10,
                shopName: 'Refresh Shop',
                cityName: 'Shenzhen',
                districtName: 'Nanshan',
                marketPrice: 100,
                bargainPrice: 50,
                bargainCommodityDynamic: {
                  hasInventory: 5,
                  initialInventoryTotal: 10,
                  hasBargainAmount: 5,
                  hasBargainCount: 5,
                  hasHeatCount: 100
                }
              }
            ]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const autoLoginService = {
      ensureValidCookie: vi
        .fn()
        .mockResolvedValueOnce('old-cookie')
        .mockResolvedValueOnce('new-cookie')
        .mockResolvedValue('new-cookie'),
      clearCache: vi.fn()
    };
    const client = new JeeSiteDataSourceClient(autoLoginService as any);

    const dataset = await client.loadDataset();

    expect(dataset.packages).toHaveLength(1);
    expect(dataset.isComplete).toBe(true);
    expect(autoLoginService.clearCache).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Cookie).toBe(
      'old-cookie'
    );
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Cookie).toBe(
      'new-cookie'
    );
  });
});
