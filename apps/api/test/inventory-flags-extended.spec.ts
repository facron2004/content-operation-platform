import { describe, expect, it } from 'vitest';
import type { InventoryTrendPoint } from '@content/shared';
import { buildInventoryFlag, normalizeInventoryTrend } from '../src/content/inventory-flags';

describe('inventory flags', () => {
  function dateStr(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  }

  function snapshot(daysAgo: number, stock: number): InventoryTrendPoint {
    return {
      date: dateStr(daysAgo),
      snapshotTime: `${dateStr(daysAgo)}T12:00:00.000Z`,
      remainingStock: stock
    };
  }

  it('returns normal when stock is zero (sold out)', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 0,
      saleStatus: 'selling',
      normalizedTrend: normalizeInventoryTrend([snapshot(2, 0), snapshot(1, 0), snapshot(0, 0)])
    });

    expect(result.inventoryFlag).toBe('normal');
    expect(result.inventoryFlagLevel).toBe('none');
  });

  it('flags unsold_today when only 1 recent day has positive stock', () => {
    // Most recent day has positive stock, previous day has zero → breaks chain at 1
    const result = buildInventoryFlag({
      currentStockLeft: 10,
      saleStatus: 'selling',
      normalizedTrend: normalizeInventoryTrend([snapshot(1, 0), snapshot(0, 10)])
    });

    expect(result.inventoryFlag).toBe('unsold_today');
    expect(result.inventoryFlagLevel).toBe('info');
  });

  it('flags unsold_2d when 2 consecutive recent days have positive stock', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 20,
      saleStatus: 'selling',
      normalizedTrend: normalizeInventoryTrend([snapshot(2, 0), snapshot(1, 20), snapshot(0, 20)])
    });

    expect(result.inventoryFlag).toBe('unsold_2d');
    expect(result.inventoryFlagLevel).toBe('warning');
  });

  it('flags unsold_3d_slow when 3+ consecutive recent days have positive stock', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 50,
      saleStatus: 'selling',
      normalizedTrend: normalizeInventoryTrend([snapshot(3, 50), snapshot(2, 50), snapshot(1, 50), snapshot(0, 50)])
    });

    expect(result.inventoryFlag).toBe('unsold_3d_slow');
    expect(result.inventoryFlagLevel).toBe('danger');
  });

  it('returns normal when saleStatus is recycle', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 30,
      saleStatus: 'recycle',
      normalizedTrend: normalizeInventoryTrend([snapshot(1, 30), snapshot(0, 30)])
    });

    expect(result.inventoryFlag).toBe('normal');
  });

  it('handles empty trend with zero stock', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 0,
      saleStatus: 'selling',
      normalizedTrend: []
    });

    expect(result.inventoryFlag).toBe('normal');
    expect(result.inventoryTrend).toEqual([]);
  });

  it('detects hot_sold_out_recent for consistently sold-out packages', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 0,
      saleStatus: 'selling',
      normalizedTrend: normalizeInventoryTrend([snapshot(2, 0), snapshot(1, 0), snapshot(0, 0)])
    });

    expect(result.inventorySalesFlag).toBe('hot_sold_out_recent');
    expect(result.inventorySalesLevel).toBe('success');
  });

  it('detects slow_never_sold_out for packages always with stock', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 80,
      saleStatus: 'selling',
      normalizedTrend: normalizeInventoryTrend([snapshot(3, 80), snapshot(2, 80), snapshot(1, 80), snapshot(0, 80)])
    });

    expect(result.inventorySalesFlag).toBe('slow_never_sold_out');
    expect(result.inventorySalesLevel).toBe('danger');
  });

  it('reports observing status for mixed recent trend', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 15,
      saleStatus: 'selling',
      normalizedTrend: normalizeInventoryTrend([snapshot(2, 0), snapshot(1, 20), snapshot(0, 15)])
    });

    expect(result.inventorySalesFlag).toBe('observing');
    expect(result.inventorySalesLevel).toBe('info');
  });
});
