import { describe, it, expect } from 'vitest';
import {
  reconcileRow,
  summarizeMismatches,
  type FenMismatch
} from '../../../packages/shared/src/money-reconcile';

describe('reconcileRow — Float ↔ *Fen 一致性', () => {
  it('完全一致（float 与 fen 均非空且匹配）不报不一致', () => {
    const mis = reconcileRow('OrderHeader', { orderAmount: 39.9, orderAmountFen: 3990n }, 1);
    expect(mis).toHaveLength(0);
  });

  it('两者均为 null 视为一致', () => {
    const mis = reconcileRow('OrderHeader', { orderAmount: null, orderAmountFen: null }, 1);
    expect(mis).toHaveLength(0);
  });

  it('missing：Float 非 null 但 Fen 为 null', () => {
    const mis = reconcileRow('OrderHeader', { orderAmount: 39.9, orderAmountFen: null }, 7);
    expect(mis).toHaveLength(1);
    expect(mis[0]).toMatchObject({
      model: 'OrderHeader',
      rowId: 7,
      floatField: 'orderAmount',
      fenField: 'orderAmountFen',
      floatValue: 39.9,
      computedFen: 3990n,
      storedFen: null,
      kind: 'missing'
    });
  });

  it('value：两者非空但数值不符', () => {
    const mis = reconcileRow('OrderHeader', { orderAmount: 39.9, orderAmountFen: 3991n }, 8);
    expect(mis).toHaveLength(1);
    expect(mis[0].kind).toBe('value');
    expect(mis[0].computedFen).toBe(3990n);
    expect(mis[0].storedFen).toBe(3991n);
    expect(mis[0].diff).toBe(-1n);
  });

  it('orphan：Float 为 null 但 Fen 非空（不自动修正，仅报告）', () => {
    const mis = reconcileRow('OrderHeader', { orderAmount: null, orderAmountFen: 3990n }, 9);
    expect(mis).toHaveLength(1);
    expect(mis[0].kind).toBe('orphan');
    expect(mis[0].computedFen).toBe(null);
    expect(mis[0].storedFen).toBe(3990n);
    expect(mis[0].diff).toBe(-3990n);
  });

  it('多字段行：仅不命中的字段被报告', () => {
    // ContentPackage: originalPrice 命中(10→1000)，salePrice 缺失(5→null)
    const mis = reconcileRow(
      'ContentPackage',
      {
        originalPrice: 10,
        originalPriceFen: 1000n,
        salePrice: 5,
        salePriceFen: null
      },
      3
    );
    expect(mis).toHaveLength(1);
    expect(mis[0].floatField).toBe('salePrice');
    expect(mis[0].kind).toBe('missing');
  });

  it('未知模型返回空数组', () => {
    expect(reconcileRow('NoSuchModel', { a: 1, aFen: 100n }, 1)).toHaveLength(0);
  });

  it('NaN/Infinite 的 Float 视为非法（computedFen=null，归类为 missing/value）', () => {
    const mis = reconcileRow('OrderHeader', { orderAmount: NaN, orderAmountFen: null }, 1);
    expect(mis.length).toBeGreaterThan(0);
    expect(mis[0].computedFen).toBe(null);
  });

  it('浮点误差 0.1+0.2：round 后仍可与整数分对齐', () => {
    const bad = 0.1 + 0.2; // 0.30000000000000004
    const mis = reconcileRow('OrderHeader', { orderAmount: bad, orderAmountFen: 30n }, 1);
    expect(mis).toHaveLength(0); // 30.000000000000004 → round → 30
  });

  it('原生 SQL 可能返回 number 类型的 Fen，也能正确比对', () => {
    // 模拟 $queryRawUnsafe 返回 number 而非 bigint
    const mis = reconcileRow(
      'OrderHeader',
      { orderAmount: 39.9, orderAmountFen: 3990 as unknown as bigint },
      1
    );
    expect(mis).toHaveLength(0);
  });
});

describe('summarizeMismatches — 汇总', () => {
  it('按类型 / 模型 / 字段聚合', () => {
    const mis: FenMismatch[] = [
      {
        model: 'OrderHeader',
        rowId: 1,
        floatField: 'paidAmount',
        fenField: 'paidAmountFen',
        floatValue: 1,
        computedFen: 100n,
        storedFen: null,
        kind: 'missing',
        diff: 100n
      },
      {
        model: 'OrderHeader',
        rowId: 2,
        floatField: 'paidAmount',
        fenField: 'paidAmountFen',
        floatValue: 2,
        computedFen: 200n,
        storedFen: 201n,
        kind: 'value',
        diff: -1n
      },
      {
        model: 'MerchantDailyMetrics',
        rowId: 3,
        floatField: 'refundAmount',
        fenField: 'refundAmountFen',
        floatValue: null,
        computedFen: null,
        storedFen: 50n,
        kind: 'orphan',
        diff: -50n
      }
    ];
    const s = summarizeMismatches(mis);
    expect(s.mismatches).toBe(3);
    expect(s.byKind).toEqual({ missing: 1, value: 1, orphan: 1 });
    expect(s.byModel).toEqual({ OrderHeader: 2, MerchantDailyMetrics: 1 });
    expect(s.byField['OrderHeader.paidAmountFen']).toBe(2);
    expect(s.byField['MerchantDailyMetrics.refundAmountFen']).toBe(1);
  });
});
