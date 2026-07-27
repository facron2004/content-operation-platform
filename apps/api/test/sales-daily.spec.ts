import { describe, expect, it } from 'vitest';
import {
  assertInclusiveDaySpan,
  computeStaleFlag,
  daySpanErrorCode,
  daysBetween,
  diffDailySales,
  isDateKey,
  STALE_BUCKET_LABELS,
  STALE_BUCKET_SEVERITY
} from '../src/domain/sales-daily';
import { DEFAULT_INVENTORY_RULES } from '../src/domain/rules-defaults';

// ==================== daysBetween ====================

describe('daysBetween', () => {
  it('returns 0 for identical dates', () => {
    expect(daysBetween('2026-05-13', '2026-05-13')).toBe(0);
  });

  it('counts calendar days in UTC', () => {
    expect(daysBetween('2026-05-13', '2026-05-23')).toBe(10);
    expect(daysBetween('2026-05-13', '2026-06-12')).toBe(30);
    expect(daysBetween('2026-05-13', '2026-07-12')).toBe(60);
  });

  it('returns 0 for invalid input', () => {
    expect(daysBetween('', '2026-05-13')).toBe(0);
    expect(daysBetween('not-a-date', '2026-05-13')).toBe(0);
    // ISO datetimes must NOT count as date keys (refresh-cap bypass vector).
    expect(daysBetween('2025-01-01T00:00:00.000Z', '2025-12-31T00:00:00.000Z')).toBe(0);
  });

  it('clamps negative to 0', () => {
    expect(daysBetween('2026-05-23', '2026-05-13')).toBe(0);
  });
});

describe('isDateKey / assertInclusiveDaySpan', () => {
  it('isDateKey accepts only YYYY-MM-DD', () => {
    expect(isDateKey('2026-07-01')).toBe(true);
    expect(isDateKey('2026-07-01T00:00:00.000Z')).toBe(false);
    expect(isDateKey('2026/07/01')).toBe(false);
  });

  it('accepts span within maxDays', () => {
    const r = assertInclusiveDaySpan('2026-07-01', '2026-07-10', 90);
    expect(r.span).toBe(9);
  });

  it('rejects ISO keys and start>end and over-cap spans', () => {
    try {
      assertInclusiveDaySpan('2025-01-01T00:00:00Z', '2025-12-31', 90);
      expect.fail('should throw');
    } catch (err) {
      expect(daySpanErrorCode(err)).toBe('DATE_KEY');
    }
    try {
      assertInclusiveDaySpan('2026-07-20', '2026-07-01', 90);
      expect.fail('should throw');
    } catch (err) {
      expect(daySpanErrorCode(err)).toBe('START_AFTER_END');
    }
    try {
      assertInclusiveDaySpan('2025-01-01', '2025-12-31', 90);
      expect.fail('should throw');
    } catch (err) {
      expect(daySpanErrorCode(err)).toBe('SPAN_TOO_LONG');
    }
  });
});

// ==================== diffDailySales ====================

describe('diffDailySales (库存 diff 算销量)', () => {
  it('first time seen: salesQty=0, deltaSource=jeesite_diff', () => {
    const r = diffDailySales({ lastStock: null, currentStock: 10 });
    expect(r.salesQty).toBe(0);
    expect(r.deltaSource).toBe('jeesite_diff');
  });

  it('normal decrease: 10 -> 5 → salesQty=5', () => {
    const r = diffDailySales({ lastStock: 10, currentStock: 5 });
    expect(r.salesQty).toBe(5);
    expect(r.deltaSource).toBe('jeesite_diff');
  });

  it('sold out: 10 -> 0 → salesQty=10', () => {
    const r = diffDailySales({ lastStock: 10, currentStock: 0 });
    expect(r.salesQty).toBe(10);
    expect(r.deltaSource).toBe('jeesite_diff');
  });

  it('restock: 10 -> 12 → salesQty=0, deltaSource=manual_correction', () => {
    const r = diffDailySales({ lastStock: 10, currentStock: 12 });
    expect(r.salesQty).toBe(0);
    expect(r.deltaSource).toBe('manual_correction');
  });

  it('flat: 10 -> 10 → salesQty=0', () => {
    const r = diffDailySales({ lastStock: 10, currentStock: 10 });
    expect(r.salesQty).toBe(0);
    expect(r.deltaSource).toBe('jeesite_diff');
  });

  it('negative current stock clamped to 0', () => {
    const r = diffDailySales({ lastStock: 10, currentStock: -5 });
    expect(r.salesQty).toBe(10);
  });

  it('rounds fractional stock values to integers', () => {
    // Math.round(10.4)=10, Math.round(5.6)=6, 10-6=4
    const r = diffDailySales({ lastStock: 10.4, currentStock: 5.6 });
    expect(r.salesQty).toBe(4);
  });
});

// ==================== computeStaleFlag ====================

describe('computeStaleFlag (零动销阶梯)', () => {
  const rules = DEFAULT_INVENTORY_RULES;
  const today = '2026-07-13';

  it('售罄 → normal', () => {
    expect(
      computeStaleFlag({ lastSalesDate: '2026-06-01', currentStockLeft: 0, todayKey: today, rules })
    ).toBe('normal');
  });

  it('从未销售过 → stale_60d (最严重)', () => {
    expect(
      computeStaleFlag({ lastSalesDate: null, currentStockLeft: 5, todayKey: today, rules })
    ).toBe('stale_60d');
  });

  it('6 天前销售过 → normal', () => {
    expect(
      computeStaleFlag({ lastSalesDate: '2026-07-07', currentStockLeft: 5, todayKey: today, rules })
    ).toBe('normal');
  });

  it('7 天前销售过 → stale_7d (边界)', () => {
    expect(
      computeStaleFlag({ lastSalesDate: '2026-07-06', currentStockLeft: 5, todayKey: today, rules })
    ).toBe('stale_7d');
  });

  it('14 天前销售过 → stale_7d (在 7-14 区间)', () => {
    expect(
      computeStaleFlag({ lastSalesDate: '2026-06-29', currentStockLeft: 5, todayKey: today, rules })
    ).toBe('stale_7d');
  });

  it('15 天前销售过 → stale_15d (边界)', () => {
    expect(
      computeStaleFlag({ lastSalesDate: '2026-06-28', currentStockLeft: 5, todayKey: today, rules })
    ).toBe('stale_15d');
  });

  it('30 天前销售过 → stale_30d (主战场边界)', () => {
    expect(
      computeStaleFlag({ lastSalesDate: '2026-06-13', currentStockLeft: 5, todayKey: today, rules })
    ).toBe('stale_30d');
  });

  it('29 天前销售过 → stale_15d (未到 30 天线)', () => {
    expect(
      computeStaleFlag({ lastSalesDate: '2026-06-14', currentStockLeft: 5, todayKey: today, rules })
    ).toBe('stale_15d');
  });

  it('60 天前销售过 → stale_60d (边界)', () => {
    expect(
      computeStaleFlag({ lastSalesDate: '2026-05-14', currentStockLeft: 5, todayKey: today, rules })
    ).toBe('stale_60d');
  });

  it('61 天前销售过 → stale_60d', () => {
    expect(
      computeStaleFlag({ lastSalesDate: '2026-05-13', currentStockLeft: 5, todayKey: today, rules })
    ).toBe('stale_60d');
  });

  it('RuleConfig 注入阈值：stale30Days=45 后 30 天前销售过 → stale_15d', () => {
    const customRules = { ...rules, stale30Days: 45 };
    expect(
      computeStaleFlag({
        lastSalesDate: '2026-06-13',
        currentStockLeft: 5,
        todayKey: today,
        rules: customRules
      })
    ).toBe('stale_15d');
  });
});

// ==================== 阶梯元数据 ====================

describe('STALE_BUCKET_LABELS / SEVERITY', () => {
  it('所有 5 个 bucket 都有标签', () => {
    const buckets = ['normal', 'stale_7d', 'stale_15d', 'stale_30d', 'stale_60d'] as const;
    for (const b of buckets) {
      expect(STALE_BUCKET_LABELS[b]).toBeTruthy();
      expect(typeof STALE_BUCKET_SEVERITY[b]).toBe('number');
    }
  });

  it('severity 单调递增', () => {
    expect(STALE_BUCKET_SEVERITY.normal).toBeLessThan(STALE_BUCKET_SEVERITY.stale_7d);
    expect(STALE_BUCKET_SEVERITY.stale_7d).toBeLessThan(STALE_BUCKET_SEVERITY.stale_15d);
    expect(STALE_BUCKET_SEVERITY.stale_15d).toBeLessThan(STALE_BUCKET_SEVERITY.stale_30d);
    expect(STALE_BUCKET_SEVERITY.stale_30d).toBeLessThan(STALE_BUCKET_SEVERITY.stale_60d);
  });
});
