import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientGet: vi.fn(),
  cachedGet: vi.fn(),
  clearCache: vi.fn()
}));

vi.mock('../http-client', () => ({
  default: { get: mocks.clientGet }
}));

vi.mock('../cache.service', () => ({
  cachedGet: mocks.cachedGet,
  clearCache: mocks.clearCache
}));

import { getOverviewDistribution, getOverviewKpis, getOverviewTopOffenders } from './overview.api';

describe('overview API refresh', () => {
  beforeEach(() => {
    mocks.clientGet.mockReset().mockResolvedValue({ data: { items: [] } });
    mocks.cachedGet.mockReset().mockImplementation((fetcher: () => Promise<unknown>) => fetcher());
    mocks.clearCache.mockReset();
  });

  it('uses the web cache for an ordinary read', async () => {
    await getOverviewKpis('2026-08-05');

    expect(mocks.cachedGet).toHaveBeenCalledTimes(1);
    expect(mocks.clientGet).toHaveBeenCalledWith('/overview/kpis', {
      params: { date: '2026-08-05' }
    });
  });

  it('bypasses the web cache and sends force plus the business date on manual reload', async () => {
    await getOverviewKpis('2026-08-05', true);
    await getOverviewDistribution('stale', 20, '2026-08-05', true);
    await getOverviewTopOffenders(10, '2026-08-05', true);

    expect(mocks.cachedGet).not.toHaveBeenCalled();
    expect(mocks.clearCache).toHaveBeenCalledWith('/overview/kpis');
    expect(mocks.clearCache).toHaveBeenCalledWith('/overview/distribution');
    expect(mocks.clearCache).toHaveBeenCalledWith('/overview/top-offenders');
    expect(mocks.clientGet).toHaveBeenNthCalledWith(1, '/overview/kpis?force=true', {
      params: { date: '2026-08-05' }
    });
    expect(mocks.clientGet).toHaveBeenNthCalledWith(2, '/overview/distribution?force=true', {
      params: { dim: 'stale', limit: 20, date: '2026-08-05' }
    });
    expect(mocks.clientGet).toHaveBeenNthCalledWith(3, '/overview/top-offenders?force=true', {
      params: { limit: 10, date: '2026-08-05' }
    });
  });
});
