import { describe, expect, it } from 'vitest';
import {
  aggregatePartnerPickupPointRows,
  mapPartnerPickupPointRow,
  parsePointCenti
} from '../src/finance-center/partner-pickup-point.mapper';

describe('JeeSite partner pickup-point mapping', () => {
  it('maps nested partner fields and preserves two-decimal points exactly', () => {
    const result = mapPartnerPickupPointRow({
      id: 'record-1',
      corePartnerId: 'merchant-1',
      availableCommodityPoint: 132.66,
      state: 1,
      corePartner: { id: 'merchant-1', name: '合作商一' }
    });

    expect(result).toEqual({
      merchantId: 'merchant-1',
      merchantName: '合作商一',
      availablePointCenti: 13266n,
      state: 1,
      invalidPoint: false
    });
    expect(parsePointCenti('1,234.50')).toBe(123450n);
    expect(parsePointCenti('132.666')).toBeNull();
  });

  it('aggregates only active records into the merchant available-point balance', () => {
    const result = aggregatePartnerPickupPointRows([
      {
        id: 'record-1',
        corePartnerId: 'merchant-1',
        availableCommodityPoint: '55',
        state: 1,
        corePartner: { name: '合作商一' }
      },
      {
        id: 'record-2',
        corePartnerId: 'merchant-1',
        availableCommodityPoint: '46.5',
        state: 1,
        corePartner: { name: '合作商一' }
      },
      {
        id: 'record-3',
        corePartnerId: 'merchant-1',
        availableCommodityPoint: null,
        state: 2,
        corePartner: { name: '合作商一' }
      }
    ]);

    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.items).toEqual([
      {
        merchantId: 'merchant-1',
        merchantName: '合作商一',
        availablePointCenti: 10150n,
        recordCount: 3,
        activeRecordCount: 2,
        invalidPointRows: 0
      }
    ]);
  });

  it('skips rows without a merchant ID and rejects malformed point values', () => {
    const result = aggregatePartnerPickupPointRows([
      { id: 'record-without-merchant', availableCommodityPoint: 10, state: 1 },
      {
        id: 'record-invalid-point',
        corePartnerId: 'merchant-2',
        availableCommodityPoint: 'not-a-point',
        state: 1
      }
    ]);

    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.items[0]).toMatchObject({
      merchantId: 'merchant-2',
      availablePointCenti: 0n,
      invalidPointRows: 1
    });
  });
});
