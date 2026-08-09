import { describe, expect, it } from 'vitest';
import {
  withHeavyAggregateGate,
  heavyAggregateInFlight,
  heavyAggregateWaiters,
  HEAVY_AGGREGATE_CONCURRENCY,
  HEAVY_AGGREGATE_WAIT_QUEUE_MAX,
  HEAVY_LIST_CACHE_MAX_SIZE
} from '../src/common/heavy-aggregate-gate';
import { QUERY_IN_CHUNKS_CONCURRENCY } from '../src/common/sql-chunk';

describe('residual #67 heavy aggregate gate', () => {
  it('exports concurrency + wait-queue + list cache maxSize bounds', () => {
    expect(HEAVY_AGGREGATE_CONCURRENCY).toBe(2);
    expect(HEAVY_AGGREGATE_WAIT_QUEUE_MAX).toBe(16);
    expect(HEAVY_LIST_CACHE_MAX_SIZE).toBe(64);
    expect(HEAVY_AGGREGATE_CONCURRENCY).toBe(QUERY_IN_CHUNKS_CONCURRENCY);
  });

  it('bounds concurrent heavy work and rejects over-cap waiters', async () => {
    const started: number[] = [];
    const release: Array<() => void> = [];
    const block = () =>
      new Promise<void>((resolve) => {
        release.push(resolve);
      });

    // Fill active slots.
    const p1 = withHeavyAggregateGate(async () => {
      started.push(1);
      await block();
      return 1;
    });
    const p2 = withHeavyAggregateGate(async () => {
      started.push(2);
      await block();
      return 2;
    });
    // Let both acquire.
    await new Promise((r) => setTimeout(r, 10));
    expect(heavyAggregateInFlight()).toBe(2);
    expect(started.length).toBe(2);

    // Queue one waiter (under cap).
    let thirdStarted = false;
    const p3 = withHeavyAggregateGate(async () => {
      thirdStarted = true;
      return 3;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(thirdStarted).toBe(false);
    expect(heavyAggregateWaiters()).toBe(1);

    // Fill wait queue to max, next should reject.
    const waiters: Promise<unknown>[] = [];
    for (let i = 0; i < HEAVY_AGGREGATE_WAIT_QUEUE_MAX - 1; i++) {
      waiters.push(withHeavyAggregateGate(async () => 'w').catch((e: Error) => e.name));
    }
    await new Promise((r) => setTimeout(r, 10));
    expect(heavyAggregateWaiters()).toBe(HEAVY_AGGREGATE_WAIT_QUEUE_MAX);

    let rejected: Error | null = null;
    try {
      await withHeavyAggregateGate(async () => 'overflow');
    } catch (e) {
      rejected = e as Error;
    }
    expect(rejected?.name).toBe('HeavyAggregateQueueFullError');

    // Drain.
    for (const r of release) r();
    await Promise.all([p1, p2, p3, ...waiters]);
    expect(thirdStarted).toBe(true);
    expect(heavyAggregateInFlight()).toBe(0);
    expect(heavyAggregateWaiters()).toBe(0);
  });

  it('allows nested heavy work to reuse its parent slot', async () => {
    const result = await Promise.race([
      Promise.all([
        withHeavyAggregateGate(async () => {
          await Promise.resolve();
          return withHeavyAggregateGate(async () => 'nested-1');
        }),
        withHeavyAggregateGate(async () => {
          await Promise.resolve();
          return withHeavyAggregateGate(async () => 'nested-2');
        })
      ]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('nested heavy gate deadlocked')), 100)
      )
    ]);

    expect(result).toEqual(['nested-1', 'nested-2']);
    expect(heavyAggregateInFlight()).toBe(0);
    expect(heavyAggregateWaiters()).toBe(0);
  });
});

describe('residual #67 filter-first zero-sales candidates', () => {
  it('pushes NOT EXISTS + LIMIT into SQL (no 10k findMany + JS filter)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-candidates.ts'),
      'utf8'
    );
    expect(src).toMatch(/NOT EXISTS/);
    expect(src).toMatch(/ZERO_SALES_MERCHANTS_CACHE_CAP/);
    expect(src).toMatch(/LIMIT \?/);
    // Must not materialize via findMany then filter recentSet.
    expect(src).not.toMatch(/contentPackage\.findMany/);
    expect(src).not.toMatch(/recentSet/);
  });
});

describe('residual #67 early LIMIT movement active skus', () => {
  it('caps loadActiveSkus at MOVEMENT_CACHE_CAP via SQL LIMIT', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'movement', 'movement-sku-loaders.ts'),
      'utf8'
    );
    expect(src).toContain('MOVEMENT_CACHE_CAP');
    expect(src).toMatch(/Math\.min\(PLATFORM_SCAN_LIMIT,\s*MOVEMENT_CACHE_CAP\)/);
    expect(src).toMatch(/LIMIT \?/);
    // Prefer raw SQL over Prisma findMany take:PLATFORM_SCAN for early cap.
    expect(src).not.toMatch(/contentPackage\.findMany/);
  });
});

describe('residual #67 merchant list prune-before-enrich', () => {
  it('limits merchants to CACHE_CAP and totalSkuDesc orders in SQL', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-list-queries.ts'),
      'utf8'
    );
    expect(src).toContain('MERCHANT_LIST_CACHE_CAP');
    expect(src).toMatch(/Math\.min\(PLATFORM_SCAN_LIMIT,\s*MERCHANT_LIST_CACHE_CAP\)/);
    expect(src).toMatch(/totalSkuDesc/);
    expect(src).toMatch(/"totalSku" DESC/);
  });
});

describe('residual #67 top-offenders stockLeft + rule-config mapPool', () => {
  it('merchant_total CTE filters stockLeft > 0', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'overview', 'overview-stale.ts'),
      'utf8'
    );
    expect(src).toContain('merchant_total');
    expect(src).toMatch(/merchant_total AS[\s\S]*stockLeft"\s*>\s*0/);
    // No correlated per-group COUNT.
    expect(src).not.toMatch(
      /\(SELECT COUNT\(\*\) FROM "ContentPackage" cp2 WHERE cp2\."merchantId" = cp\."merchantId"\)/
    );
  });

  it('loadEffectiveRulesForMerchants uses mapPool not CONCURRENCY=16', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'rule-config-read.ts'),
      'utf8'
    );
    expect(src).toContain('mapPool');
    expect(src).toContain('QUERY_IN_CHUNKS_CONCURRENCY');
    expect(src).toMatch(/mapPool\(unique,\s*QUERY_IN_CHUNKS_CONCURRENCY/);
    expect(src).not.toMatch(/const CONCURRENCY\s*=\s*16/);
  });

  it('loadTotalSkuByMerchant counts stockLeft > 0 only', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-package-loaders.ts'),
      'utf8'
    );
    expect(src).toMatch(
      /loadTotalSkuByMerchant[\s\S]*stockLeft"\s*>\s*0[\s\S]*GROUP BY "merchantId"/
    );
  });
});

describe('residual #67 services wire heavy gate + lowered maxSize', () => {
  it('movement/zero-sales/merchant services use withHeavyAggregateGate + HEAVY_LIST_CACHE_MAX_SIZE', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const mov = await fs.readFile(
      path.join(__dirname, '..', 'src', 'movement', 'movement.service.ts'),
      'utf8'
    );
    const zs = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales.service.ts'),
      'utf8'
    );
    const mer = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant.service.ts'),
      'utf8'
    );
    for (const src of [mov, zs, mer]) {
      expect(src).toContain('withHeavyAggregateGate');
      expect(src).toContain('HEAVY_LIST_CACHE_MAX_SIZE');
      expect(src).toMatch(/new TtlCache\([^,]+,\s*HEAVY_LIST_CACHE_MAX_SIZE\)/);
    }
  });

  it('ops/today whitelists USER_ROLES before cache key', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'dashboard.controller.ts'),
      'utf8'
    );
    // Both ops/today and ops/review whitelist role.
    const matches = src.match(/USER_ROLES as readonly string\[\]/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/getTodayOperationConsole[\s\S]*validRole/);
  });
});
