import { describe, expect, it, vi } from 'vitest';
import { resolveGmvHourly } from '../src/gmv/gmv-resolve';

describe('GMV hourly read errors', () => {
  it('propagates an OrderHeader query failure instead of returning zero points', async () => {
    const failure = new Error('database unavailable');
    const prisma = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(failure),
      contentPackage: {},
      dailyMetrics: {},
      orderHeader: {}
    } as unknown as Parameters<typeof resolveGmvHourly>[0];

    await expect(resolveGmvHourly(prisma, '2026-08-09')).rejects.toBe(failure);
  });
});
