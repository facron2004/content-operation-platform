import type { InventoryTrendPoint } from '@content/shared';
import { describe, expect, it } from 'vitest';
import { buildInventoryFlag } from '../src/content/inventory-flags';

const trend = (items: Array<[string, number]>): InventoryTrendPoint[] =>
  items.map(([date, remainingStock]) => ({
    date,
    snapshotTime: `${date}T10:00:00.000Z`,
    remainingStock
  }));

describe('buildInventoryFlag', () => {
  it('marks recent all-zero stock days as hot-selling', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 0,
      saleStatus: 'selling',
      trend: trend([
        ['2026-05-12', 0],
        ['2026-05-13', 0],
        ['2026-05-14', 0]
      ])
    });

    expect(result.inventorySalesFlag).toBe('hot_sold_out_recent');
    expect(result.inventorySalesLabel).toBe('连续售罄·热销');
    expect(result.inventorySalesLevel).toBe('success');
    expect(result.inventorySoldOutDays).toBe(3);
    expect(result.inventoryFlag).toBe('normal');
  });

  it('marks recent days that never reached zero stock as slow-moving', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 20,
      saleStatus: 'selling',
      trend: trend([
        ['2026-05-12', 80],
        ['2026-05-13', 50],
        ['2026-05-14', 20]
      ])
    });

    expect(result.inventorySalesFlag).toBe('slow_never_sold_out');
    expect(result.inventorySalesLabel).toBe('连续未售罄·滞销');
    expect(result.inventorySalesLevel).toBe('danger');
    expect(result.inventoryObservedDays).toBe(3);
    expect(result.inventoryFlag).toBe('unsold_3d_slow');
  });

  it('marks a package as unsold today when only the current day has stock', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 8,
      saleStatus: 'selling',
      trend: trend([['2026-05-14', 8]])
    });

    expect(result.inventoryFlag).toBe('unsold_today');
    expect(result.inventoryFlagLabel).toBe('今日未售罄');
    expect(result.inventoryFlagLevel).toBe('info');
    expect(result.inventorySalesFlag).toBe('observing');
    expect(result.inventoryUnsoldDays).toBe(1);
    expect(result.priority).toBe(1);
  });

  it('marks two consecutive stocked days as unsold_2d', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 6,
      saleStatus: 'selling',
      trend: trend([
        ['2026-05-13', 7],
        ['2026-05-14', 6]
      ])
    });

    expect(result.inventoryFlag).toBe('unsold_2d');
    expect(result.inventoryFlagLabel).toBe('连续2天未售罄');
    expect(result.inventoryFlagLevel).toBe('warning');
    expect(result.inventorySalesFlag).toBe('observing');
    expect(result.inventoryUnsoldDays).toBe(2);
    expect(result.priority).toBe(2);
  });

  it('marks three stocked days with one or fewer stock decrease as unsold_3d_slow', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 11,
      saleStatus: 'selling',
      trend: trend([
        ['2026-05-12', 12],
        ['2026-05-13', 12],
        ['2026-05-14', 11]
      ])
    });

    expect(result.inventoryFlag).toBe('unsold_3d_slow');
    expect(result.inventoryFlagLabel).toBe('连续3天未售罄');
    expect(result.inventoryFlagLevel).toBe('danger');
    expect(result.inventorySalesFlag).toBe('slow_never_sold_out');
    expect(result.inventoryUnsoldDays).toBe(3);
    expect(result.priority).toBe(3);
  });

  it('does not promotion-flag sold-out or recycled packages', () => {
    expect(
      buildInventoryFlag({
        currentStockLeft: 0,
        saleStatus: 'selling',
        trend: trend([['2026-05-14', 0]])
      }).inventoryFlag
    ).toBe('normal');

    expect(
      buildInventoryFlag({
        currentStockLeft: 5,
        saleStatus: 'recycle',
        trend: trend([['2026-05-14', 5]])
      }).inventoryFlag
    ).toBe('normal');
  });
});
