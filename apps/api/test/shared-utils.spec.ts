import { describe, expect, it } from 'vitest';
import { exponentialBackoff, formatRatePercent, sleep } from '@content/shared';

describe('exponentialBackoff', () => {
  it('returns base on first attempt', () => {
    expect(exponentialBackoff(0, 1000, 8000)).toBe(1000);
  });

  it('doubles each attempt', () => {
    expect(exponentialBackoff(1, 1000, 8000)).toBe(2000);
    expect(exponentialBackoff(2, 1000, 8000)).toBe(4000);
    expect(exponentialBackoff(3, 1000, 8000)).toBe(8000);
  });

  it('caps at maxMs even on large attempts', () => {
    expect(exponentialBackoff(10, 1000, 5000)).toBe(5000);
    expect(exponentialBackoff(100, 1000, 5000)).toBe(5000);
  });

  it('handles attempt=0 with maxMs < base gracefully', () => {
    // Edge case: caller passes cap lower than base — cap wins.
    expect(exponentialBackoff(0, 5000, 1000)).toBe(1000);
  });
});

describe('sleep', () => {
  it('resolves after roughly the requested delay', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(500);
  });

  it('returns a thenable that resolves to undefined', async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});

describe('formatRatePercent', () => {
  it('multiplies by 100 and appends %', () => {
    expect(formatRatePercent(0.123)).toBe('12.3%');
    expect(formatRatePercent(0.5)).toBe('50.0%');
    expect(formatRatePercent(1)).toBe('100.0%');
  });

  it('honours the decimals arg', () => {
    expect(formatRatePercent(0.12345, 2)).toBe('12.35%');
    expect(formatRatePercent(0.12345, 0)).toBe('12%');
  });

  it('falls back to "-" for null/undefined/NaN', () => {
    expect(formatRatePercent(null)).toBe('-');
    expect(formatRatePercent(undefined)).toBe('-');
    expect(formatRatePercent(Number.NaN)).toBe('-');
  });
});
