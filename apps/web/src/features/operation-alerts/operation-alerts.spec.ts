import { describe, expect, it } from 'vitest';
import type { GmvMerchantRow } from '../../services/api/gmv.api';
import {
  buildOperationAlerts,
  HIGH_REFUND_RATE,
  LOW_VERIFY_RATE
} from './operation-alerts';

function merchant(overrides: Partial<GmvMerchantRow> = {}): GmvMerchantRow {
  return {
    merchantId: 'merchant-1',
    merchantName: '示例商家',
    areaName: '华东',
    gmvFen: '123456',
    refundRate: 0,
    verifyRate: 0.8,
    paidOrderCount: 10,
    ...overrides
  };
}

describe('operation alert rules', () => {
  it('creates actionable high-refund and low-verify signals from merchant facts', () => {
    const alerts = buildOperationAlerts([
      merchant({ merchantId: 'refund', refundRate: HIGH_REFUND_RATE }),
      merchant({ merchantId: 'verify', verifyRate: LOW_VERIFY_RATE - 0.01 }),
      merchant({ merchantId: 'small', paidOrderCount: 2, refundRate: 0.2, verifyRate: 0.1 })
    ]);

    expect(alerts.map((item) => `${item.merchantId}:${item.kind}`)).toEqual([
      'refund:refund',
      'verify:verify'
    ]);
    expect(alerts[0]?.gmvDisplay).toBe('¥ 1,234.56');
  });

  it('marks severe rates as danger', () => {
    const alerts = buildOperationAlerts([
      merchant({ refundRate: 0.1 }),
      merchant({ merchantId: 'verify', verifyRate: 0.1 })
    ]);

    expect(alerts.map((item) => item.level)).toEqual(['danger', 'danger']);
  });
});
