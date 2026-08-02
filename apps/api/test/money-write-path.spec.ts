import { describe, expect, it, vi } from 'vitest';
import {
  isSalesAmountReconciled,
  recomputeDailyMetricsRange,
  recomputePackageSalesAmountRange
} from '../src/money';
import type { PackageSalesAmountPrisma } from '../src/money/package-sales-amount';
import { toOrderHeaderSharedFields } from '../src/gmv/gmv-order-header.types';
import { batchUpsertOrderHeaders } from '../src/gmv/gmv-order-header.upsert';
import { mapJeesiteOrderListToDataset } from '../src/content/jeesite-order-adapter';

describe('recomputeDailyMetricsRange', () => {
  it('deletes only the date window then inserts aggregates', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(3) // DELETE
      .mockResolvedValueOnce(2); // INSERT
    const result = await recomputeDailyMetricsRange(
      { $executeRawUnsafe: execute },
      '2026-07-01',
      '2026-07-03'
    );
    expect(result).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      rowsAffected: 2
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(String(execute.mock.calls[0][0])).toMatch(/DELETE FROM "DailyMetrics"/);
    expect(execute.mock.calls[0][1]).toBe('2026-07-01');
    expect(execute.mock.calls[0][2]).toBe('2026-07-03');
    expect(String(execute.mock.calls[1][0])).toMatch(/INSERT OR REPLACE INTO "DailyMetrics"/);
  });

  it('keeps delete+insert on the adapter-safe direct execution path', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(1) // DELETE
      .mockResolvedValueOnce(1); // INSERT
    const transaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: any) => Promise<unknown>) =>
        cb({ $executeRawUnsafe: execute })
      );
    const result = await recomputeDailyMetricsRange(
      { $executeRawUnsafe: execute, $transaction: transaction },
      '2026-07-01',
      '2026-07-01'
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.rowsAffected).toBe(1);
  });

  it('rejects inverted range', async () => {
    await expect(
      recomputeDailyMetricsRange({ $executeRawUnsafe: vi.fn() }, '2026-07-10', '2026-07-01')
    ).rejects.toThrow(/startDate/);
  });
});

describe('package-sales-amount', () => {
  it('reconciles within absolute or relative tolerance', () => {
    expect(isSalesAmountReconciled(100, 100.5)).toBe(true);
    expect(isSalesAmountReconciled(1000, 1000.5)).toBe(true);
    expect(isSalesAmountReconciled(10000, 10020)).toBe(false); // 0.2% > 0.1% and > ¥1
    expect(isSalesAmountReconciled(10000, 10005)).toBe(true); // 0.05%
  });

  it('upserts salesAmount and reports coverage', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(2) // zero stale salesAmount
      .mockResolvedValueOnce(4); // upsert
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ gmv: 80 }]) // joinable
      .mockResolvedValueOnce([{ gmv: 100 }]); // total
    const transaction = vi.fn(async (fn: (tx: PackageSalesAmountPrisma) => Promise<unknown>) =>
      fn({ $executeRawUnsafe: execute, $queryRawUnsafe: query })
    ) as unknown as NonNullable<PackageSalesAmountPrisma['$transaction']>;
    const result = await recomputePackageSalesAmountRange(
      { $executeRawUnsafe: execute, $queryRawUnsafe: query, $transaction: transaction },
      '2026-07-01',
      '2026-07-02'
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(result.rowsUpserted).toBe(4);
    expect(result.joinableGmv).toBe(80);
    expect(result.unjoinableGmv).toBe(20);
    expect(result.coverageRatio).toBeCloseTo(0.8);
    expect(String(execute.mock.calls[0][0])).toMatch(/UPDATE "PackageSalesDaily"/);
    expect(String(execute.mock.calls[0][0])).toMatch(/"salesAmountFen" = 0/);
    expect(String(execute.mock.calls[1][0])).toMatch(/PackageSalesDaily/);
    expect(String(execute.mock.calls[1][0])).toMatch(/salesAmount/);
  });

  it('rejects inverted range', async () => {
    const execute = vi.fn();
    const query = vi.fn();
    await expect(
      recomputePackageSalesAmountRange(
        { $executeRawUnsafe: execute, $queryRawUnsafe: query },
        '2026-07-10',
        '2026-07-01'
      )
    ).rejects.toThrow(/startDate/);
    expect(execute).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('paidAmountCard', () => {
  it('toOrderHeaderSharedFields includes paidAmountCard', () => {
    const fields = toOrderHeaderSharedFields({
      orderId: 'test-1',
      orderTime: new Date().toISOString(),
      orderAmount: 100,
      paidAmount: 80,
      paidAmountWallet: 30,
      paidAmountBonus: 10,
      paidAmountCard: 40,
      refundAmount: 0,
      verifyAmount: 80,
      pointEarned: 0,
      pointUsed: 0,
      status: 'paid'
    });
    expect(fields.paidAmountCard).toBe(40);
  });

  it('batchUpsertOrderHeaders SQL includes paidAmountCard in INSERT and UPDATE', async () => {
    const executeRaw = vi.fn().mockResolvedValue(undefined);
    const result = await batchUpsertOrderHeaders(
      { $executeRawUnsafe: executeRaw },
      [
        {
          orderId: 'test-1',
          orderTime: '2026-07-01T00:00:00.000Z',
          paidTime: '2026-07-01T12:00:00.000Z',
          orderAmount: 100,
          paidAmount: 80,
          paidAmountWallet: 30,
          paidAmountBonus: 10,
          paidAmountCard: 40,
          refundAmount: 0,
          verifyAmount: 80,
          pointEarned: 0,
          pointUsed: 5,
          status: 'paid'
        }
      ],
      40
    );
    expect(result).toEqual({ upserted: 1, skipped: 0, errors: 0, errorSamples: [] });
    const sql = String(executeRaw.mock.calls[0][0]);
    expect(sql).toMatch(/"paidAmountCardFen"/);
    expect(sql).toMatch(/"paidAmountCardFen"=excluded\."paidAmountCardFen"/);
    expect(executeRaw.mock.calls[0][1]).toContain('test-1');
  });

  it('batchUpsertOrderHeaders skips orders without orderId', async () => {
    const executeRaw = vi.fn();
    const result = await batchUpsertOrderHeaders(
      { $executeRawUnsafe: executeRaw },
      [
        {
          orderId: 'valid-1',
          orderTime: new Date().toISOString(),
          orderAmount: 10,
          paidAmount: 10,
          paidAmountWallet: 0,
          paidAmountBonus: 0,
          paidAmountCard: 10,
          status: 'paid'
        },
        {
          orderId: null,
          orderTime: new Date().toISOString(),
          orderAmount: 10,
          paidAmount: 10,
          paidAmountWallet: 0,
          paidAmountBonus: 0,
          paidAmountCard: 10,
          status: 'paid'
        },
        {
          orderTime: new Date().toISOString(),
          orderAmount: 10,
          paidAmount: 10,
          paidAmountWallet: 0,
          paidAmountBonus: 0,
          paidAmountCard: 10,
          status: 'paid'
        }
      ] as any,
      40
    );
    expect(result).toEqual({ upserted: 1, skipped: 2, errors: 0, errorSamples: [] });
  });
});

describe('jeesite-order-adapter paidAmountCard', () => {
  it('computes paidAmountCard from payPrice minus deductionBalance', () => {
    const payload = {
      rows: [
        {
          id: 'order-1',
          payPrice: 80,
          deductionBalance: 30,
          balanceIntegral: 1000,
          createDate: '2026-07-21 10:00:00',
          payDate: '2026-07-21 10:05:00',
          orderStatus: '20'
        }
      ]
    };
    const { orders } = mapJeesiteOrderListToDataset(payload);
    expect(orders[0].paidAmountCard).toBe(50);
  });

  it('sets paidAmountCard to 0 for refunded orders', () => {
    const payload = {
      rows: [
        {
          id: 'order-1',
          payPrice: 100,
          deductionBalance: 30,
          balanceIntegral: 500,
          createDate: '2026-07-21 10:00:00',
          payDate: '2026-07-21 10:05:00',
          orderStatus: '-20'
        }
      ]
    };
    const { orders } = mapJeesiteOrderListToDataset(payload);
    expect(orders[0].paidAmountCard).toBe(70);
    expect(orders[0].paidAmount).toBe(100);
  });

  it('handles negative card amount (rounded to 0)', () => {
    const payload = {
      rows: [
        {
          id: 'order-1',
          payPrice: 30,
          deductionBalance: 50,
          balanceIntegral: 0,
          createDate: '2026-07-21 10:00:00',
          payDate: '2026-07-21 10:05:00',
          orderStatus: '20'
        }
      ]
    };
    const { orders } = mapJeesiteOrderListToDataset(payload);
    expect(orders[0].paidAmountCard).toBe(0);
  });
});
