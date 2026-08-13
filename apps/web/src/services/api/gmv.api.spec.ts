import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock('../http-client', () => ({
  default: { get: mocks.get }
}));

import { getGmvByMerchant, getGmvDistribution } from './gmv.api';

describe('GMV distribution request identity', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(123456789);
    mocks.get.mockReset().mockResolvedValue({
      data: { items: [], limit: 20, matched: 0, truncated: false }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses distinct URLs for concurrent category and area reads', async () => {
    await Promise.all([
      getGmvDistribution('category', 8, true),
      getGmvDistribution('area', 20, true)
    ]);

    const categoryUrl = mocks.get.mock.calls[0]?.[0];
    const areaUrl = mocks.get.mock.calls[1]?.[0];

    expect(categoryUrl).toContain('dim=category');
    expect(areaUrl).toContain('dim=area');
    expect(categoryUrl).not.toBe(areaUrl);
  });

  it('keeps selected business dates in distribution and merchant request identity', async () => {
    await Promise.all([
      getGmvDistribution('area', 20, true, '2026-08-09'),
      getGmvDistribution('area', 20, true, '2026-08-10'),
      getGmvByMerchant('gmvDesc', 1, 20, true, '2026-08-09'),
      getGmvByMerchant('gmvDesc', 1, 20, true, '2026-08-10')
    ]);

    const urls = mocks.get.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain('date=2026-08-09');
    expect(urls[1]).toContain('date=2026-08-10');
    expect(urls[2]).toContain('date=2026-08-09');
    expect(urls[3]).toContain('date=2026-08-10');
    expect(new Set(urls).size).toBe(4);
  });
});
