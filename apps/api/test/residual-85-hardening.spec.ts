import { describe, expect, it } from 'vitest';
import { pageMerchants } from '../src/gmv/gmv-metrics';
import { pageTopMerchants } from '../src/refund/refund-top-merchants';
import { paginate } from '@content/shared';
import type { GmvMerchantRow } from '../src/gmv/gmv.dto';
import type { TopMerchantRow } from '../src/refund/refund.dto';

describe('residual #85 GMV refresh money recompute heavy gate', () => {
  it('refreshGmvFromJeesite wraps recompute phase in withHeavyAggregateGate', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'gmv', 'gmv-refresh.ts'),
      'utf8'
    );
    expect(src).toContain('withHeavyAggregateGate');
    expect(src).toContain('runMoneyRecomputes');
    // Pull stays outside the gate (network-bound); recompute is gated.
    expect(src).toMatch(
      /pullJeesiteOrders[\s\S]*?withHeavyAggregateGate\(\(\)\s*=>\s*runMoneyRecomputes/
    );
    expect(src).toContain('recomputeDailyMetricsRange');
    expect(src).toContain('recomputePackageSalesAmountRange');
    // invalidateCache after merchant-sales recompute (not mid-write).
    const fnStart = src.indexOf('async function runMoneyRecomputes');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart);
    const inv = fn.indexOf('invalidateCache()');
    const ms = fn.indexOf('recomputeRange');
    expect(inv).toBeGreaterThan(ms);
  });

  it('merchant-sales recompute uses heavy gate with nested-reentry guard', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant-sales', 'merchant-sales-recompute.ts'),
      'utf8'
    );
    expect(src).toContain('withHeavyAggregateGate');
    expect(src).toContain('heavyAggregateInFlight');
    // Nested call from GMV refresh must not re-enter the gate.
    expect(src).toMatch(/heavyAggregateInFlight\(\)\s*>\s*0/);
  });

  it('handleGmvRefresh does not force-cold getKpis after refresh', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'gmv', 'gmv.controller.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('export async function handleGmvRefresh');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n// ---', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toMatch(/getKpis\(endDate,\s*false\)/);
    expect(fn).not.toMatch(/getKpis\(endDate,\s*true\)/);
  });
});

describe('residual #85 page clamp defense-in-depth', () => {
  const merchants: GmvMerchantRow[] = Array.from({ length: 5 }, (_, i) => ({
    merchantId: `m${i}`,
    merchantName: `M${i}`,
    areaName: null,
    gmvFen: BigInt((100 - i) * 100),
    gmvRefundFen: 0n,
    gmvVerifyFen: 0n,
    refundRate: 0,
    verifyRate: 0,
    paidOrderCount: 1
  }));

  it('pageMerchants clamps oversized page/pageSize', () => {
    // pageSize 999 → 100; page 0 → 1
    const r = pageMerchants(merchants, 0, 999);
    expect(r.items.length).toBeLessThanOrEqual(5);
    expect(r.items.length).toBeLessThanOrEqual(100);
    // Huge page yields empty (offset past end) not NaN/negative slice
    const far = pageMerchants(merchants, 10_000, 20);
    expect(far.items).toEqual([]);
    expect(far.hasMore).toBe(false);
  });

  it('pageTopMerchants clamps oversized page/pageSize', () => {
    const items: TopMerchantRow[] = merchants.map((m) => ({
      merchantId: m.merchantId,
      merchantName: m.merchantName,
      areaName: null,
      gmv: Number(m.gmvFen ?? 0n) / 100,
      refund: 1,
      verify: 1,
      refundRate: 0.01,
      verifyRate: 0.01,
      paidOrderCount: 1
    }));
    const r = pageTopMerchants(items, -5, 500);
    expect(r.items.length).toBeLessThanOrEqual(100);
    expect(r.items.length).toBeGreaterThan(0);
    const far = pageTopMerchants(items, 9_999, 50);
    expect(far.items).toEqual([]);
  });

  it('shared paginate clamps page to LIST_PAGE_MAX 500', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const r = paginate(items, 9999, 2);
    expect(r.pagination.page).toBe(500);
    // offset = 499 * 2 = 998 → empty for 10-item list
    expect(r.items).toEqual([]);
  });
});
