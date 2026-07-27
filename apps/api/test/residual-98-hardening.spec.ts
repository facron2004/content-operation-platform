import { describe, expect, it, vi } from 'vitest';
import { batchUpsertOrderHeaders } from '../src/gmv/gmv-order-header.upsert';
import type { OrderLike } from '../src/gmv/gmv-order-header.types';

function makeOrder(id: string): OrderLike {
  return {
    orderId: id,
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
    pointUsed: 0,
    status: 'paid'
  };
}

describe('residual #98 GMV batchUpsert binary-split fallback', () => {
  it('batchUpsertOrderHeaders source binary-splits (not N serial for-loop)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'gmv', 'gmv-order-header.upsert.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('export async function batchUpsertOrderHeaders');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart);
    expect(fn).toContain('Math.ceil(batch.length / 2)');
    expect(fn).toMatch(/batch\.slice\(0,\s*mid\)/);
    expect(fn).toMatch(/batch\.slice\(mid\)/);
    // No N serial for-loop over batch on failure.
    expect(fn).not.toMatch(/for\s*\(\s*let\s+j\s*=\s*0;\s*j\s*<\s*batch\.length;\s*j\+\+\s*\)/);
  });

  it('binary-splits a failing multi-row batch so good rows still upsert', async () => {
    // Fail any multi-row attempt; succeed single-row for all but the bad order.
    const executeRaw = vi.fn().mockImplementation(async (sql: string, ...params: unknown[]) => {
      // Count '?' groups roughly by row count in VALUES — simpler: param count / col count.
      // ALL_COLS is 35 (28 + 7 *Fen dual-write cols, PRD §7.4 Phase 3).
      const nParams = params.length;
      const COLS = 35;
      const nRows = nParams / COLS;
      if (nRows > 1) throw new Error('multi-row fail');
      const orderId = String(params[0] ?? '');
      if (orderId === 'bad-1') throw new Error('bad row');
      return 1;
    });
    const transaction = vi
      .fn()
      .mockImplementation(
        async (cb: (tx: { $executeRawUnsafe: typeof executeRaw }) => Promise<void>) => {
          await cb({ $executeRawUnsafe: executeRaw });
        }
      );

    const result = await batchUpsertOrderHeaders(
      { $transaction: transaction, $executeRawUnsafe: executeRaw },
      [makeOrder('ok-1'), makeOrder('bad-1'), makeOrder('ok-2'), makeOrder('ok-3')],
      40
    );

    expect(result.upserted).toBe(3);
    expect(result.errors).toBe(1);
    expect(result.errorSamples).toContain('bad-1');
    // Must not have issued 4 independent serial single-row attempts as the only strategy —
    // at least one multi-row attempt happened (the initial batch).
    const multiRowAttempts = executeRaw.mock.calls.filter((c) => (c.length - 1) / 35 > 1);
    expect(multiRowAttempts.length).toBeGreaterThan(0);
  });
});
