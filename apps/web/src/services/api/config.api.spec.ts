import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientGet: vi.fn(),
  cachedGet: vi.fn(),
  clearCache: vi.fn(),
  deleteCacheKey: vi.fn()
}));

vi.mock('../http-client', () => ({
  default: { get: mocks.clientGet }
}));

vi.mock('../cache.service', () => ({
  cachedGet: mocks.cachedGet,
  clearCache: mocks.clearCache,
  deleteCacheKey: mocks.deleteCacheKey
}));

import { getAICopyStatus } from './config.api';

describe('AI copy status refresh', () => {
  beforeEach(() => {
    mocks.clientGet.mockReset().mockResolvedValue({ data: { enabled: true } });
    mocks.cachedGet.mockReset().mockImplementation((fetcher: () => Promise<unknown>) => fetcher());
    mocks.clearCache.mockReset();
    mocks.deleteCacheKey.mockReset();
  });

  it('keeps ordinary reads cached and invalidates the exact key before every manual read', async () => {
    await getAICopyStatus();
    await getAICopyStatus(true);
    await getAICopyStatus(true);

    expect(mocks.cachedGet).toHaveBeenCalledTimes(3);
    expect(mocks.clearCache).toHaveBeenNthCalledWith(1, '/content/ai-copy/status');
    expect(mocks.clearCache).toHaveBeenNthCalledWith(2, '/content/ai-copy/status');
    expect(mocks.clientGet).toHaveBeenCalledTimes(3);
    expect(mocks.clientGet).toHaveBeenCalledWith('/content/ai-copy/status');
  });
});
