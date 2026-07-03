import { describe, expect, it } from 'vitest';
import {
  clamp,
  clampNonNegative,
  describeError,
  exponentialBackoff,
  extractErrorMessage,
  formatRatePercent,
  safeRatio,
  sleep
} from '@content/shared';

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

describe('safeRatio', () => {
  it('returns 0 when denominator is 0', () => {
    expect(safeRatio(5, 0)).toBe(0);
  });

  it('returns a finite, rounded ratio otherwise', () => {
    expect(safeRatio(1, 3)).toBe(0.3333);
    expect(safeRatio(2, 4)).toBe(0.5);
  });

  it('honours precision', () => {
    expect(safeRatio(1, 3, 2)).toBe(0.33);
  });
});

describe('clamp / clampNonNegative', () => {
  it('clamps to [min, max] with defaults', () => {
    expect(clamp(50)).toBe(50);
    expect(clamp(-5)).toBe(0);
    expect(clamp(150)).toBe(100);
  });

  it('clamps with caller-provided range', () => {
    expect(clamp(150, 0, 200)).toBe(150);
  });

  it('clampNonNegative does NOT cap at 100 (regression: stockTotal=182 must not collapse to 100)', () => {
    expect(clampNonNegative(182)).toBe(182);
    expect(clampNonNegative(0)).toBe(0);
    expect(clampNonNegative(-3)).toBe(0);
  });
});

describe('describeError', () => {
  it('returns Error.message for Error instances', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('falls back to String() for non-Error thrown values', () => {
    expect(describeError('plain')).toBe('plain');
    expect(describeError(42)).toBe('42');
    expect(describeError(null)).toBe('null');
    expect(describeError(undefined)).toBe('undefined');
  });
});

describe('extractErrorMessage', () => {
  it('extracts response.data.message when isAxiosError matches', () => {
    const fake = { response: { status: 400, data: { message: 'invalid input' } } };
    const isAxiosError = (e: unknown): e is typeof fake =>
      typeof e === 'object' && e !== null && 'response' in e;
    expect(extractErrorMessage(fake, { isAxiosError })).toBe('invalid input');
  });

  it('returns a timeout-specific message for ECONNABORTED', () => {
    const fake = { code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' };
    const isAxiosError = (e: unknown): e is typeof fake =>
      typeof e === 'object' && e !== null && 'code' in e;
    expect(extractErrorMessage(fake, { isAxiosError })).toBe('请求超时,请稍后重试');
  });

  it('returns a network message when axios-like error has no response', () => {
    const fake = { message: 'Network Error' };
    const isAxiosError = (e: unknown): e is typeof fake =>
      typeof e === 'object' && e !== null && 'message' in e;
    expect(extractErrorMessage(fake, { isAxiosError })).toBe('网络连接失败,请检查网络');
  });

  it('falls back to Error.message for non-axios errors', () => {
    expect(extractErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('uses fallback when nothing usable is found', () => {
    expect(extractErrorMessage({}, { fallback: 'X' })).toBe('X');
  });
});
