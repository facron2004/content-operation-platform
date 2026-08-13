import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { TtlCache } from '../src/common/ttl-cache';

vi.mock('../src/common/stale-bucket-stats', () => ({
  computePlatformStaleBucketStats: vi.fn().mockResolvedValue({
    normal: 1,
    stale_7d: 0,
    stale_15d: 0,
    stale_30d: 0,
    stale_60d: 0
  }),
  loadPlatformStaleBucketStats: vi.fn().mockResolvedValue({
    normal: 1,
    stale_7d: 0,
    stale_15d: 0,
    stale_30d: 0,
    stale_60d: 0
  })
}));

import { loadMovementToday } from '../src/movement/movement-today';

describe('movement source updatedAt', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays tied to source rows across different request times, including forced reads', async () => {
    const queryRaw = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*) AS "c"')) return [{ c: 1 }];
      if (sql.includes('COUNT(DISTINCT psd."packageId")')) return [{ c: 1 }];
      if (sql.includes('MAX("sourceUpdatedAt")')) {
        return [{ sourceUpdatedAt: '2026-08-03 02:03:04' }];
      }
      throw new Error(`Unexpected movement query: ${sql}`);
    });
    const prisma = { $queryRawUnsafe: queryRaw } as unknown as PrismaService;
    const cache = new TtlCache(60_000, 8);
    vi.useFakeTimers();

    vi.setSystemTime(new Date('2026-08-05T01:00:00.000Z'));
    const first = await loadMovementToday(prisma, cache, '2026-08-02', true);
    vi.setSystemTime(new Date('2026-08-06T10:00:00.000Z'));
    const second = await loadMovementToday(prisma, cache, '2026-08-02', true);

    expect(first.updatedAt).toBe('2026-08-03T02:03:04.000Z');
    expect(second.updatedAt).toBe(first.updatedAt);
    expect(first.updatedAt).not.toBe('2026-08-05T01:00:00.000Z');
    expect(second.updatedAt).not.toBe('2026-08-06T10:00:00.000Z');
    const sourceCalls = queryRaw.mock.calls.filter(([sql]) =>
      String(sql).includes('MAX("sourceUpdatedAt")')
    );
    expect(sourceCalls).toHaveLength(2);
    expect(sourceCalls[0]?.[1]).toBe('2026-08-02');
  });

  it('returns null when no relevant source row has an update time', async () => {
    const queryRaw = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*) AS "c"')) return [{ c: 0 }];
      if (sql.includes('COUNT(DISTINCT psd."packageId")')) return [{ c: 0 }];
      if (sql.includes('MAX("sourceUpdatedAt")')) return [{ sourceUpdatedAt: null }];
      throw new Error(`Unexpected movement query: ${sql}`);
    });

    const result = await loadMovementToday(
      { $queryRawUnsafe: queryRaw } as unknown as PrismaService,
      new TtlCache(60_000, 8),
      '2026-08-02',
      true
    );

    expect(result.updatedAt).toBeNull();
  });
});
