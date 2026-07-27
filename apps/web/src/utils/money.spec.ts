import { describe, it, expect } from 'vitest';
import {
  formatFenYuan,
  displayMoney,
  readFen,
  sumMoneyFen,
  sumMoney
} from './money';

describe('formatFenYuan', () => {
  it('formats integer fen with thousands + 2 decimals', () => {
    expect(formatFenYuan(3990)).toBe('¥ 39.90');
    expect(formatFenYuan('123456789')).toBe('¥ 1,234,567.89');
    expect(formatFenYuan(0)).toBe('¥ 0.00');
  });

  it('handles negative fen', () => {
    expect(formatFenYuan(-250)).toBe('-¥ 2.50');
    expect(formatFenYuan('-105')).toBe('-¥ 1.05');
  });

  it('treats blank as zero', () => {
    expect(formatFenYuan(null)).toBe('¥ 0.00');
    expect(formatFenYuan(undefined)).toBe('¥ 0.00');
    expect(formatFenYuan('')).toBe('¥ 0.00');
  });

  it('uses integer math (no float drift)', () => {
    // 0.1 + 0.2 浮点灾难在分整数下不成立
    expect(formatFenYuan(30)).toBe('¥ 0.30');
    expect(formatFenYuan(1990 + 1)).toBe('¥ 19.91');
  });
});

describe('displayMoney', () => {
  it('prefers backend *Display', () => {
    expect(displayMoney({ totalGmv: 39.9, totalGmvDisplay: '39.90' }, 'totalGmv')).toBe(
      '¥ 39.90'
    );
  });

  it('falls back to *Fen when *Display missing', () => {
    expect(displayMoney({ totalGmv: 39.9, totalGmvFen: '3990' }, 'totalGmv')).toBe('¥ 39.90');
  });

  it('falls back to legacy float when neither present', () => {
    expect(displayMoney({ totalGmv: 1234.5 }, 'totalGmv')).toBe('¥ 1,234.5');
  });

  it('handles null record / field gracefully', () => {
    expect(displayMoney(null, 'gmv')).toBe('—');
    expect(displayMoney({}, 'gmv')).toBe('—');
  });

  it('normalizes *Display lacking ¥ / thousands', () => {
    expect(displayMoney({ gmv: 1234.5, gmvDisplay: '1234.5' }, 'gmv')).toBe('¥ 1,234.50');
  });
});

describe('readFen', () => {
  it('reads *Fen as bigint', () => {
    expect(readFen({ totalGmvFen: '3990' }, 'totalGmv')).toBe(3990n);
  });
  it('falls back to float × 100', () => {
    expect(readFen({ totalGmv: 39.9 }, 'totalGmv')).toBe(3990n);
  });
  it('returns null when blank', () => {
    expect(readFen({}, 'totalGmv')).toBe(null);
    expect(readFen(null, 'totalGmv')).toBe(null);
  });
});

describe('sumMoneyFen / sumMoney', () => {
  const rows = [
    { gmv: 10.5, gmvFen: '1050' },
    { gmv: 20.25, gmvFen: '2025' },
    { gmv: 0, gmvFen: '0' }
  ];
  it('sums fen with integer math (no float drift)', () => {
    expect(sumMoneyFen(rows, 'gmv')).toBe(3075n);
    expect(sumMoney(rows, 'gmv')).toBe('¥ 30.75');
  });
  it('falls back to float when *Fen missing', () => {
    const f = [{ gmv: 10.5 }, { gmv: 20.25 }];
    expect(sumMoneyFen(f, 'gmv')).toBe(3075n);
  });
  it('ignores null/blank rows', () => {
    expect(sumMoneyFen([null, {}, { gmvFen: '100' }], 'gmv')).toBe(100n);
  });
});
