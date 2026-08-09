import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock('../http-client', () => ({
  default: { get: mocks.get }
}));

import { getGmvDistribution } from './gmv.api';

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
});
