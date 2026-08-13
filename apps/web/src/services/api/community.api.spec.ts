import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  cachedGet: vi.fn()
}));

vi.mock('../http-client', () => ({ default: { get: mocks.get } }));
vi.mock('../cache.service', () => ({ cachedGet: mocks.cachedGet }));

import { getCommunities } from './community.api';

describe('community API refresh behavior', () => {
  beforeEach(() => {
    mocks.get.mockReset().mockResolvedValue({ data: { items: [] } });
    mocks.cachedGet.mockReset().mockImplementation((fetcher: () => Promise<unknown>) => fetcher());
  });

  it('uses the SPA cache for an ordinary read', async () => {
    await getCommunities({ role: 'admin' });

    expect(mocks.cachedGet).toHaveBeenCalledOnce();
    expect(mocks.get).toHaveBeenCalledWith('/content/communities', {
      params: { role: 'admin' }
    });
  });

  it('bypasses the SPA cache and sends force for a manual refresh', async () => {
    await getCommunities({ role: 'admin', force: true });

    expect(mocks.cachedGet).not.toHaveBeenCalled();
    expect(mocks.get).toHaveBeenCalledWith('/content/communities', {
      params: { role: 'admin', force: true }
    });
  });
});
