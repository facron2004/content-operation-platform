import { describe, expect, it } from 'vitest';
import {
  COPY_VERSION_LETTERS,
  DEFAULT_SCENARIO,
  currentPrice,
  formatPrice,
  latestSnapshotsByPackage,
  localDateKey,
  paginate,
  randomShortId,
  resolvePagination
} from '@content/shared';
import type { ContentPackage } from '@content/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makePackage = (overrides: Partial<ContentPackage> = {}): ContentPackage => ({
  packageId: 'pkg-1',
  packageName: 'Test',
  packageType: 'welfare',
  merchantId: 'm-1',
  merchantName: 'Merchant',
  areaId: 'a-1',
  areaName: 'Area',
  category: '美食',
  originalPrice: 100,
  salePrice: 80,
  commissionRate: 0.1,
  grossProfit: 10,
  stockTotal: 100,
  stockLeft: 50,
  startTime: '2026-01-01',
  endTime: '2026-12-31',
  useRules: [],
  sellingPoints: [],
  miniProgramPath: '/pages/test',
  merchantCooperationScore: 5,
  areaMatchScore: 5,
  timeMatchScore: 5,
  historyScore: 5,
  ...overrides
});

// ---------------------------------------------------------------------------
// currentPrice
// ---------------------------------------------------------------------------

describe('currentPrice', () => {
  it('returns salePrice when no temporarySalePrice', () => {
    expect(currentPrice(makePackage({ salePrice: 80 }))).toBe(80);
  });

  it('prefers temporarySalePrice over salePrice', () => {
    expect(currentPrice(makePackage({ salePrice: 80, temporarySalePrice: 65 }))).toBe(65);
  });

  it('falls back to salePrice when temporarySalePrice is null', () => {
    expect(currentPrice(makePackage({ salePrice: 80, temporarySalePrice: null }))).toBe(80);
  });

  it('falls back to salePrice when temporarySalePrice is undefined', () => {
    expect(currentPrice(makePackage({ salePrice: 80, temporarySalePrice: undefined }))).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// formatPrice
// ---------------------------------------------------------------------------

describe('formatPrice', () => {
  it('formats integer prices as plain numbers', () => {
    expect(formatPrice(100)).toBe('100');
    expect(formatPrice(0)).toBe('0');
  });

  it('formats decimal prices with specified decimals', () => {
    expect(formatPrice(99.5, 2)).toBe('99.5');
    expect(formatPrice(99.123, 2)).toBe('99.12');
  });

  it('returns dash for null / undefined / NaN', () => {
    expect(formatPrice(null)).toBe('-');
    expect(formatPrice(undefined)).toBe('-');
    expect(formatPrice(Number.NaN)).toBe('-');
  });
});

// ---------------------------------------------------------------------------
// COPY_VERSION_LETTERS / DEFAULT_SCENARIO constants
// ---------------------------------------------------------------------------

describe('shared constants', () => {
  it('COPY_VERSION_LETTERS has exactly 5 letters A-E', () => {
    expect(COPY_VERSION_LETTERS).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('DEFAULT_SCENARIO is a non-empty string', () => {
    expect(typeof DEFAULT_SCENARIO).toBe('string');
    expect(DEFAULT_SCENARIO.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// latestSnapshotsByPackage
// ---------------------------------------------------------------------------

describe('latestSnapshotsByPackage', () => {
  const snap = (packageId: string, snapshotTime: string) => ({ packageId, snapshotTime });

  it('returns an empty map for empty input', () => {
    expect(latestSnapshotsByPackage([]).size).toBe(0);
  });

  it('picks the latest snapshot per packageId', () => {
    const snapshots = [
      snap('pkg-1', '2026-07-01T10:00:00Z'),
      snap('pkg-1', '2026-07-02T10:00:00Z'),
      snap('pkg-2', '2026-07-01T10:00:00Z'),
      snap('pkg-1', '2026-07-01T15:00:00Z'),
      snap('pkg-2', '2026-07-03T10:00:00Z')
    ];
    const result = latestSnapshotsByPackage(snapshots);

    expect(result.size).toBe(2);
    expect(result.get('pkg-1')?.snapshotTime).toBe('2026-07-02T10:00:00Z');
    expect(result.get('pkg-2')?.snapshotTime).toBe('2026-07-03T10:00:00Z');
  });

  it('preserves extra fields on the snapshot', () => {
    const snapshots = [
      { packageId: 'pkg-1', snapshotTime: '2026-07-01T10:00:00Z', remainingStock: 42 }
    ];
    const result = latestSnapshotsByPackage(snapshots);
    expect(result.get('pkg-1')?.remainingStock).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// localDateKey
// ---------------------------------------------------------------------------

describe('localDateKey', () => {
  it('formats a date as YYYY-MM-DD using local time', () => {
    // Jan 5 2026 local time
    const date = new Date(2026, 0, 5);
    expect(localDateKey(date)).toBe('2026-01-05');
  });

  it('pads single-digit months and days', () => {
    const date = new Date(2026, 2, 9); // March 9
    expect(localDateKey(date)).toBe('2026-03-09');
  });

  it('handles December 31 correctly', () => {
    const date = new Date(2026, 11, 31);
    expect(localDateKey(date)).toBe('2026-12-31');
  });
});

// ---------------------------------------------------------------------------
// randomShortId
// ---------------------------------------------------------------------------

describe('randomShortId', () => {
  it('returns a string of length 5', () => {
    const id = randomShortId();
    expect(typeof id).toBe('string');
    expect(id.length).toBe(5);
  });

  it('generates unique values (probabilistic)', () => {
    const ids = new Set(Array.from({ length: 50 }, () => randomShortId()));
    // With 36^5 ≈ 60M possibilities, 50 draws should all be unique
    expect(ids.size).toBeGreaterThanOrEqual(45);
  });
});

// ---------------------------------------------------------------------------
// paginate
// ---------------------------------------------------------------------------

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it('returns the first page with default pageSize', () => {
    const result = paginate(items);
    expect(result.items).toEqual(items);
    expect(result.pagination).toEqual({ page: 1, pageSize: 50, total: 25, totalPages: 1 });
  });

  it('slices items correctly for page 2', () => {
    const result = paginate(items, 2, 10);
    expect(result.items).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(result.pagination).toEqual({ page: 2, pageSize: 10, total: 25, totalPages: 3 });
  });

  it('returns empty slice for out-of-range page', () => {
    const result = paginate(items, 10, 10);
    expect(result.items).toEqual([]);
    expect(result.pagination.totalPages).toBe(3);
  });

  it('clamps pageSize to [1, 200]', () => {
    const r1 = paginate(items, 1, 0);
    expect(r1.pagination.pageSize).toBe(1);

    const r2 = paginate(items, 1, 500);
    expect(r2.pagination.pageSize).toBe(200);
  });

  it('uses explicit total when provided', () => {
    const result = paginate(items.slice(0, 5), 1, 5, 100);
    expect(result.pagination.total).toBe(100);
    expect(result.pagination.totalPages).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// resolvePagination
// ---------------------------------------------------------------------------

describe('resolvePagination', () => {
  it('defaults to page 1, pageSize 50', () => {
    const result = resolvePagination(undefined, undefined, 0);
    expect(result).toEqual({ page: 1, pageSize: 50, offset: 0, totalPages: 1 });
  });

  it('computes offset correctly', () => {
    const result = resolvePagination(3, 20, 100);
    expect(result).toEqual({ page: 3, pageSize: 20, offset: 40, totalPages: 5 });
  });

  it('clamps page to minimum 1', () => {
    const result = resolvePagination(0, 10, 50);
    expect(result.page).toBe(1);
    expect(result.offset).toBe(0);
  });

  it('clamps pageSize to [1, 200]', () => {
    expect(resolvePagination(1, -5, 10).pageSize).toBe(1);
    expect(resolvePagination(1, 999, 10).pageSize).toBe(200);
  });

  it('returns totalPages=1 when total is 0', () => {
    expect(resolvePagination(1, 10, 0).totalPages).toBe(1);
  });
});
