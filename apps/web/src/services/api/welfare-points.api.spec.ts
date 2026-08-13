import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientGet: vi.fn(),
  clientPost: vi.fn(),
  cachedGet: vi.fn(),
  clearCache: vi.fn()
}));

vi.mock('../http-client', () => ({
  default: { get: mocks.clientGet, post: mocks.clientPost },
  downloadBlob: vi.fn()
}));

vi.mock('../cache.service', () => ({
  cachedGet: mocks.cachedGet,
  clearCache: mocks.clearCache
}));

import {
  getWelfarePointsList,
  getWelfarePointsSummary,
  refreshWelfarePoints
} from './welfare-points.api';

describe('welfare points API refresh', () => {
  beforeEach(() => {
    mocks.clientGet.mockReset().mockResolvedValue({ data: { list: [] } });
    mocks.clientPost.mockReset().mockResolvedValue({ data: { total: 0 } });
    mocks.cachedGet.mockReset().mockImplementation((fetcher: () => Promise<unknown>) => fetcher());
    mocks.clearCache.mockReset();
  });

  it('uses the Web cache for ordinary summary and list reads', async () => {
    await getWelfarePointsSummary({ page: 1, pageSize: 20 });
    await getWelfarePointsList({ page: 1, pageSize: 20 });

    expect(mocks.cachedGet).toHaveBeenCalledTimes(2);
    expect(mocks.clientGet).toHaveBeenNthCalledWith(1, '/welfare-points/summary', {
      params: { page: 1, pageSize: 20 }
    });
    expect(mocks.clientGet).toHaveBeenNthCalledWith(2, '/welfare-points', {
      params: { page: 1, pageSize: 20 }
    });
  });

  it('performs a real sync request and invalidates every cached welfare page', async () => {
    await refreshWelfarePoints();

    expect(mocks.clientPost).toHaveBeenCalledWith('/welfare-points/refresh');
    expect(mocks.clearCache).toHaveBeenCalledWith('/welfare-points');
  });

  it('bypasses the Web cache for both reads after a manual sync', async () => {
    const params = { page: 2, pageSize: 20 };
    await getWelfarePointsSummary(params, true);
    await getWelfarePointsList(params, true);

    expect(mocks.cachedGet).not.toHaveBeenCalled();
    expect(mocks.clearCache).toHaveBeenCalledWith('/welfare-points/summary');
    expect(mocks.clearCache).toHaveBeenCalledWith('/welfare-points');
    expect(mocks.clientGet).toHaveBeenNthCalledWith(1, '/welfare-points/summary', { params });
    expect(mocks.clientGet).toHaveBeenNthCalledWith(2, '/welfare-points', { params });
  });
});
