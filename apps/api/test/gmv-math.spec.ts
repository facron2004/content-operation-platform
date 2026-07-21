import { describe, expect, it } from 'vitest';
import { gmvFromParts, rateAgainstGmv, SQL_GMV_OH, SQL_GMV_SS } from '../src/common/gmv-math';

describe('gmv-math', () => {
  it('sums online + wallet only', () => {
    expect(gmvFromParts(100, 20)).toBe(120);
    expect(gmvFromParts(0, 0)).toBe(0);
  });

  it('rates amount against gmv via safeRatio', () => {
    expect(rateAgainstGmv(10, 100)).toBeCloseTo(0.1);
    expect(rateAgainstGmv(0, 0)).toBe(0);
  });

  it('exposes SQL fragments that exclude bonus', () => {
    expect(SQL_GMV_OH).toContain('paidAmount');
    expect(SQL_GMV_OH).toContain('paidAmountWallet');
    expect(SQL_GMV_OH).not.toContain('Bonus');
    expect(SQL_GMV_SS).toContain('paidAmountOnline');
    expect(SQL_GMV_SS).not.toContain('Bonus');
  });
});
