import { describe, expect, it } from 'vitest';
import {
  attributionStatusLabel,
  attributionStatusTagType,
  mapUnmatchedOrdersResponse
} from './attribution-core';

describe('attribution unmatched-order contract', () => {
  it('maps the paginated response and keeps fen values as wire-safe values', () => {
    const result = mapUnmatchedOrdersResponse({
      items: [
        {
          orderId: 'order-1',
          memberId: '******7788',
          packageId: 'package-1',
          paidAmountFen: '123456789012345678',
          orderAmountFen: 2000,
          paidAmountDisplay: '¥ 1,234.56',
          orderTime: '2026-08-04 12:00:00',
          status: 'paid'
        }
      ],
      total: 4,
      page: 2,
      pageSize: 50,
      dateFrom: '2026-05-07',
      dateTo: '2026-08-04'
    });

    expect(result).toMatchObject({
      total: 4,
      page: 2,
      pageSize: 50,
      dateFrom: '2026-05-07',
      dateTo: '2026-08-04'
    });
    expect(result.items[0]).toMatchObject({
      orderId: 'order-1',
      paidAmountFen: '123456789012345678',
      paidAmountDisplay: '¥ 1,234.56'
    });
  });

  it('drops invalid rows and fails closed for malformed pagination', () => {
    const result = mapUnmatchedOrdersResponse({
      items: [{ orderId: '' }, { orderId: 'order-2', status: 'refunded' }],
      total: 'not-a-number',
      page: 0,
      pageSize: 9999
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.orderId).toBe('order-2');
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(200);
  });

  it('keeps status labels and tags explicit for the order table', () => {
    expect(attributionStatusLabel('paid')).toBe('已支付');
    expect(attributionStatusLabel('other')).toBe('other');
    expect(attributionStatusTagType('refunded')).toBe('warning');
  });
});
