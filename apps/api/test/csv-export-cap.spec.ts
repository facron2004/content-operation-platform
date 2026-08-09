import { describe, expect, it } from 'vitest';
import { CSV_EXPORT_MAX_ROWS } from '../src/common/sql-chunk';
import { paginateMovementSkuRows } from '../src/movement/movement-skus';
import type { MovementSkuRow } from '../src/movement/movement.types';

function fakeRows(n: number): MovementSkuRow[] {
  return Array.from({ length: n }, (_, i) => ({
    packageId: `pkg-${i}`,
    packageName: `P${i}`,
    merchantId: 'm1',
    merchantName: 'M',
    areaName: 'A',
    category: 'c',
    salePrice: 1,
    stockLeft: 1,
    stockTotal: 10,
    lastSalesDate: null,
    daysSinceLastSale: 0,
    staleBucket: 'normal' as const,
    recent30dSalesQty: 0,
    recent30dSalesAmount: 0
  }));
}

describe('CSV_EXPORT_MAX_ROWS', () => {
  it('is a fixed 1000-row ceiling for authenticated exports', () => {
    expect(CSV_EXPORT_MAX_ROWS).toBe(1_000);
  });
});

describe('paginateMovementSkuRows export clamp', () => {
  it('clamps pageSize above CSV_EXPORT_MAX_ROWS', () => {
    const rows = fakeRows(1500);
    const result = paginateMovementSkuRows(rows, 1, 50_000);
    expect(result.items).toHaveLength(CSV_EXPORT_MAX_ROWS);
    expect(result.pagination.pageSize).toBe(CSV_EXPORT_MAX_ROWS);
    expect(result.pagination.total).toBe(1500);
    expect(result.pagination.hasMore).toBe(true);
  });

  it('preserves normal interactive page sizes', () => {
    const rows = fakeRows(100);
    const result = paginateMovementSkuRows(rows, 2, 20);
    expect(result.items).toHaveLength(20);
    expect(result.pagination.page).toBe(2);
    expect(result.pagination.pageSize).toBe(20);
    expect(result.pagination.hasMore).toBe(true);
  });
});
