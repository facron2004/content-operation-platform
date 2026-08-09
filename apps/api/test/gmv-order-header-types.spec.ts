import { describe, expect, it } from 'vitest';
import * as orderHeaderTypes from '../src/gmv/gmv-order-header.types';

describe('OrderHeader type helpers', () => {
  it('keeps the canonical SQLite datetime writer and removes the dead alias', () => {
    expect('toIsoText' in orderHeaderTypes).toBe(false);

    const row = orderHeaderTypes.toOrderHeaderSharedFields({
      orderTime: '2026-08-03T00:00:00.000Z',
      paidTime: null,
      orderAmount: 10,
      paidAmount: 10,
      paidAmountWallet: 0,
      paidAmountBonus: 0,
      paidAmountCard: 10,
      status: 'paid'
    });

    expect(row.orderTime).toBe('2026-08-03 00:00:00');
    expect(row.paidTime).toBeNull();
  });
});
