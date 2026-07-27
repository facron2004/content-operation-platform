import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  INTERACTIVE_LIST_MAX_DAYS,
  resolveInteractiveDateSpan
} from '../src/common/list-date-span';

describe('resolveInteractiveDateSpan', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it(`defaults to trailing ${INTERACTIVE_LIST_MAX_DAYS}d ending today when both bounds omitted`, () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00+08:00'));
    expect(resolveInteractiveDateSpan()).toEqual({
      dateFrom: '2026-04-20',
      dateTo: '2026-07-18'
    });
  });

  it('fills trailing maxDays when only dateTo is provided', () => {
    expect(resolveInteractiveDateSpan(undefined, '2026-07-18')).toEqual({
      dateFrom: '2026-04-20',
      dateTo: '2026-07-18'
    });
  });

  it('fills forward maxDays when only dateFrom is provided', () => {
    expect(resolveInteractiveDateSpan('2026-07-01')).toEqual({
      dateFrom: '2026-07-01',
      dateTo: '2026-09-28'
    });
  });

  it('accepts an explicit span within the cap', () => {
    expect(resolveInteractiveDateSpan('2026-07-01', '2026-07-10')).toEqual({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-10'
    });
  });

  it('rejects spans longer than the max inclusive day count', () => {
    expect(() => resolveInteractiveDateSpan('2025-01-01', '2026-07-18')).toThrow(
      BadRequestException
    );
    expect(() => resolveInteractiveDateSpan('2025-01-01', '2026-07-18')).toThrow(/不能超过 90 天/);
  });

  it('rejects inverted bounds', () => {
    expect(() => resolveInteractiveDateSpan('2026-07-20', '2026-07-01')).toThrow(/dateFrom 必须/);
  });

  it('rejects ISO datetime keys that would collapse daysBetween to 0', () => {
    expect(() =>
      resolveInteractiveDateSpan('2026-07-01T00:00:00.000Z', '2026-07-10T00:00:00.000Z')
    ).toThrow(/YYYY-MM-DD/);
  });

  it(`matches merchant-sales / data-analysis interactive read cap (${INTERACTIVE_LIST_MAX_DAYS})`, () => {
    expect(INTERACTIVE_LIST_MAX_DAYS).toBe(90);
  });
});
