import { describe, expect, it } from 'vitest';
import {
  fenToDisplay,
  yuanToFen,
  parseYuanStringToFen,
  fenToApiString,
  readFenWithFallback,
  sumFen,
  toMoneyPair
} from '@content/shared';

// VNext 金额精度治理（PRD §7.4）：分整数金额工具契约测试。
describe('money-fen (PRD §7.4)', () => {
  it('fenToDisplay renders fen as yuan string', () => {
    expect(fenToDisplay(3990n)).toBe('39.90');
    expect(fenToDisplay(0n)).toBe('0.00');
    expect(fenToDisplay(5)).toBe('0.05');
    expect(fenToDisplay('100')).toBe('1.00');
    expect(fenToDisplay(-226n)).toBe('-2.26');
    expect(fenToDisplay(null)).toBe('0.00');
    expect(fenToDisplay(undefined)).toBe('0.00');
    // 超出 Number 安全范围仍精确
    expect(fenToDisplay(9007199254740993n)).toBe('90071992547409.93');
  });

  it('yuanToFen rounds float yuan to integer fen', () => {
    expect(yuanToFen(39.9)).toBe(3990n);
    // 经典浮点误差用例：0.1+0.2 → 30 分
    expect(yuanToFen(0.1 + 0.2)).toBe(30n);
    expect(yuanToFen(115.36)).toBe(11536n);
    expect(yuanToFen(-2.2562)).toBe(-226n);
    expect(yuanToFen(0)).toBe(0n);
    expect(yuanToFen(null)).toBeNull();
    expect(yuanToFen(undefined)).toBeNull();
    expect(yuanToFen(Number.NaN)).toBeNull();
    expect(yuanToFen(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('parseYuanStringToFen accepts at most 2 decimals and rejects garbage', () => {
    expect(parseYuanStringToFen('39.90')).toBe(3990n);
    expect(parseYuanStringToFen('39.9')).toBe(3990n);
    expect(parseYuanStringToFen('39')).toBe(3900n);
    expect(parseYuanStringToFen('-2.5')).toBe(-250n);
    expect(parseYuanStringToFen('¥1,234.56')).toBe(123456n);
    // 超两位小数拒绝（不吞误差）
    expect(parseYuanStringToFen('39.999')).toBeNull();
    expect(parseYuanStringToFen('abc')).toBeNull();
    expect(parseYuanStringToFen('')).toBeNull();
    expect(parseYuanStringToFen(null)).toBeNull();
  });

  it('fenToApiString serializes BigInt as string for JSON transport', () => {
    expect(fenToApiString(3990n)).toBe('3990');
    expect(fenToApiString(0n)).toBe('0');
    expect(fenToApiString(null)).toBe('0');
  });

  it('readFenWithFallback prefers Fen column, falls back to legacy Float', () => {
    expect(readFenWithFallback(3990n, 11.11)).toBe(3990n);
    expect(readFenWithFallback('3990', 11.11)).toBe(3990n);
    expect(readFenWithFallback(null, 39.9)).toBe(3990n);
    expect(readFenWithFallback(undefined, null)).toBe(0n);
  });

  it('sumFen aggregates mixed representations without precision loss', () => {
    expect(sumFen([100n, '200', 300, null, undefined])).toBe(600n);
    expect(sumFen([])).toBe(0n);
  });

  it('toMoneyPair returns PRD §7.4.4 API shape', () => {
    expect(toMoneyPair(3990n)).toEqual({ fen: '3990', display: '39.90' });
    expect(toMoneyPair(null)).toEqual({ fen: '0', display: '0.00' });
  });

  it('round-trip: display → parse → display is lossless', () => {
    for (const fen of [0n, 1n, 99n, 100n, 3990n, 123456789n, -226n]) {
      expect(parseYuanStringToFen(fenToDisplay(fen))).toBe(fen);
    }
  });
});
