import { describe, expect, it, vi } from 'vitest';
import {
  allocateTrackingCode,
  allocateTrackingCodes,
  loadExistingTrackingCodes,
  randomTrackingCode
} from '../src/common/tracking-code';

describe('tracking-code', () => {
  it('randomTrackingCode returns fixed length alphanumeric', () => {
    const code = randomTrackingCode(10);
    expect(code).toHaveLength(10);
    expect(code).toMatch(/^[a-z0-9]+$/);
  });

  it('allocateTrackingCode retries on collision then returns free code', async () => {
    // Round 1: every candidate already exists → empty free set.
    // Round 2: none exist → return first free code.
    const prisma = {
      $queryRawUnsafe: vi.fn().mockImplementation(async (sql: string, ...params: unknown[]) => {
        // First call: all candidates collide.
        if (prisma.$queryRawUnsafe.mock.calls.length === 1) {
          return params.map((c) => ({ trackingCode: String(c) }));
        }
        return [];
      })
    };
    const code = await allocateTrackingCode(prisma);
    expect(code).toMatch(/^[a-z0-9]{10}$/);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    expect(String(prisma.$queryRawUnsafe.mock.calls[0][0])).toMatch(/WHERE "trackingCode" IN/);
  });

  it('allocateTrackingCode throws when exhausted', async () => {
    const prisma = {
      // Always report every candidate as taken.
      $queryRawUnsafe: vi
        .fn()
        .mockImplementation(async (_sql: string, ...params: unknown[]) =>
          params.map((c) => ({ trackingCode: String(c) }))
        )
    };
    await expect(allocateTrackingCode(prisma, { maxAttempts: 2 })).rejects.toThrow(
      /Unable to allocate/
    );
    // maxAttempts=2 → maxRounds=3 bulk probes.
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
  });

  it('allocateTrackingCodes returns N unique codes with one bulk IN probe', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([])
    };
    const codes = await allocateTrackingCodes(prisma, 5);
    expect(codes).toHaveLength(5);
    expect(new Set(codes).size).toBe(5);
    for (const c of codes) expect(c).toMatch(/^[a-z0-9]{10}$/);
    // Happy path: single bulk existence probe (no N× COUNT).
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(String(prisma.$queryRawUnsafe.mock.calls[0][0])).toMatch(
      /SELECT "trackingCode" FROM "DistributionTask"/
    );
  });

  it('loadExistingTrackingCodes returns only codes present in DB', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ trackingCode: 'abc1234567' }])
    };
    const set = await loadExistingTrackingCodes(prisma, ['abc1234567', 'zzz9999999']);
    expect(set.has('abc1234567')).toBe(true);
    expect(set.has('zzz9999999')).toBe(false);
  });

  it('allocateTrackingCodes(0) is a no-op', async () => {
    const prisma = { $queryRawUnsafe: vi.fn() };
    await expect(allocateTrackingCodes(prisma, 0)).resolves.toEqual([]);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
