import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../http-client', () => ({
  default: { get: mocks.get }
}));

import {
  getRefundToday,
  getRefundTopMerchants,
  getRefundTrend,
  getVerifyToday,
  getVerifyTrend
} from './refund.api';

describe('refund API force signal', () => {
  beforeEach(() => {
    mocks.get.mockReset().mockResolvedValue({ data: [] });
  });

  it('adds force=true only to explicitly forced requests', async () => {
    await getRefundToday('2026-08-10', 'day', true);
    await getRefundTrend(7, '2026-08-10', 'day', false);
    await getVerifyToday('2026-08-10', 'day', true);
    await getVerifyTrend(7, '2026-08-10', 'day', true);
    await getRefundTopMerchants(
      {
        sortBy: 'refundDesc',
        page: 1,
        pageSize: 20,
        window: 'day',
        date: '2026-08-10'
      },
      true
    );

    const urls = mocks.get.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual([
      '/refund/today?force=true',
      '/refund/trend',
      '/verify/today?force=true',
      '/verify/trend?force=true',
      '/refund/top-merchants?force=true'
    ]);
  });
});
