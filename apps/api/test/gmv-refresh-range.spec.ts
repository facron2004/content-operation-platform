import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GMV_REFRESH_MAX_DAYS, handleGmvRefresh } from '../src/gmv/gmv.controller';
import {
  MERCHANT_SALES_REFRESH_MAX_DAYS,
  refreshMerchantSales
} from '../src/merchant-sales/merchant-sales.controller';
import {
  MERCHANT_SALES_READ_MAX_DAYS,
  resolveWindow
} from '../src/merchant-sales/merchant-sales-window';
import { MERCHANT_TREND_MAX_DAYS } from '../src/merchant/merchant.dto';
import { TREND_WINDOW_OPTIONS } from '../src/gmv/gmv.dto';

describe('GMV interactive trend window', () => {
  it('caps interactive trend days at 90 (no full-year 365 option)', () => {
    expect([...TREND_WINDOW_OPTIONS]).toEqual([7, 30, 90]);
    expect(TREND_WINDOW_OPTIONS).not.toContain(365);
    // Parity with merchant-sales / merchant-trend interactive read caps.
    expect(MERCHANT_SALES_READ_MAX_DAYS).toBe(90);
    expect(MERCHANT_TREND_MAX_DAYS).toBe(90);
  });
});

describe('GMV refresh range cap', () => {
  it(`rejects spans longer than ${GMV_REFRESH_MAX_DAYS} days`, async () => {
    const service = {
      refreshFromJeesite: vi.fn(),
      getKpis: vi.fn()
    };
    await expect(
      handleGmvRefresh(service as never, {
        startDate: '2025-01-01',
        endDate: '2025-12-31'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.refreshFromJeesite).not.toHaveBeenCalled();
  });

  it('accepts spans within the cap', async () => {
    const service = {
      refreshFromJeesite: vi.fn().mockResolvedValue({ pages: 1 }),
      getKpis: vi.fn().mockResolvedValue({ totalGmv: 1 })
    };
    const result = await handleGmvRefresh(service as never, {
      startDate: '2026-07-01',
      endDate: '2026-07-10'
    });
    expect(service.refreshFromJeesite).toHaveBeenCalledWith('2026-07-01', '2026-07-10');
    expect(result).toMatchObject({ pages: 1, kpi: { totalGmv: 1 } });
  });

  it('rejects ISO datetime keys that would previously bypass the cap (span=0)', async () => {
    const service = {
      refreshFromJeesite: vi.fn(),
      getKpis: vi.fn()
    };
    await expect(
      handleGmvRefresh(service as never, {
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-12-31T23:59:59.000Z'
      })
    ).rejects.toThrow(/YYYY-MM-DD/);
    expect(service.refreshFromJeesite).not.toHaveBeenCalled();
  });

  it('rejects start > end', async () => {
    const service = {
      refreshFromJeesite: vi.fn(),
      getKpis: vi.fn()
    };
    await expect(
      handleGmvRefresh(service as never, {
        startDate: '2026-07-20',
        endDate: '2026-07-01'
      })
    ).rejects.toThrow(/startDate/);
    expect(service.refreshFromJeesite).not.toHaveBeenCalled();
  });
});

describe('Merchant-sales refresh range cap', () => {
  it(`rejects spans longer than ${MERCHANT_SALES_REFRESH_MAX_DAYS} days`, () => {
    const service = { recomputeRange: vi.fn() };
    expect(() =>
      refreshMerchantSales(service as never, {
        startDate: '2025-01-01',
        endDate: '2025-12-31'
      })
    ).toThrow(BadRequestException);
    expect(service.recomputeRange).not.toHaveBeenCalled();
  });

  it('defaults to today when body empty', () => {
    const service = { recomputeRange: vi.fn().mockReturnValue({ ok: true }) };
    refreshMerchantSales(service as never, {});
    expect(service.recomputeRange).toHaveBeenCalledTimes(1);
    const [start, end] = service.recomputeRange.mock.calls[0];
    expect(start).toBe(end);
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects ISO datetime keys that would previously bypass the cap', () => {
    const service = { recomputeRange: vi.fn() };
    expect(() =>
      refreshMerchantSales(service as never, {
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-12-31T23:59:59.000Z'
      })
    ).toThrow(/YYYY-MM-DD/);
    expect(service.recomputeRange).not.toHaveBeenCalled();
  });
});

describe('Merchant-sales read window cap', () => {
  it(`rejects week/month spans longer than ${MERCHANT_SALES_READ_MAX_DAYS} days`, () => {
    expect(() => resolveWindow('month', '2020-01-01', '2026-07-22')).toThrow(BadRequestException);
    expect(() => resolveWindow('week', '2020-01-01', '2026-07-22')).toThrow(/查询区间不能超过/);
  });

  it('accepts week/month spans within the cap', () => {
    expect(resolveWindow('month', '2026-07-01', '2026-07-10')).toEqual({
      start: '2026-07-01',
      end: '2026-07-10'
    });
  });

  it('rejects inverted date/endDate on reads', () => {
    expect(() => resolveWindow('week', '2026-07-20', '2026-07-01')).toThrow(/date 必须/);
  });

  it('rejects ISO datetime keys on reads', () => {
    expect(() =>
      resolveWindow('month', '2026-07-01T00:00:00.000Z', '2026-07-10T00:00:00.000Z')
    ).toThrow(/YYYY-MM-DD/);
  });

  it('collapses year window to trailing 90-day read cap (not full calendar year)', () => {
    // Inclusive 90 days ending on the provided anchor date (or today when omitted).
    // Full calendar year was a DoS / unbounded scan path on MerchantDailyMetrics.
    expect(resolveWindow('year', '2026-07-18')).toEqual({
      start: '2026-04-20',
      end: '2026-07-18'
    });
  });
});

describe('Interactive timeline/trend day caps (90d parity)', () => {
  it('merchant trend max days matches merchant-sales read cap (not 180)', () => {
    expect(MERCHANT_TREND_MAX_DAYS).toBe(MERCHANT_SALES_READ_MAX_DAYS);
    expect(MERCHANT_TREND_MAX_DAYS).toBe(90);
  });
});
