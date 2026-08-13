import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import type { PrismaService } from '../src/prisma/prisma.service';
import { OverviewController } from '../src/overview/overview.controller';
import type { OverviewService } from '../src/overview/overview.service';
import { loadOverviewDistribution } from '../src/overview/overview-distribution';
import { loadTopOffenders } from '../src/overview/overview-stale';

describe('overview real reload and business-date anchoring', () => {
  it('lets an authorized force signal reach every overview service read', () => {
    const service = {
      getKpis: vi.fn(),
      getTrend: vi.fn(),
      getDistribution: vi.fn(),
      getTopOffenders: vi.fn()
    } as unknown as OverviewService;
    const controller = new OverviewController(service);
    const req = {
      user: { roles: ['admin'] },
      query: { force: 'true' }
    } as unknown as Request;

    controller.getKpis({ date: '2026-08-05', force: 'true' }, req);
    controller.getTrend({ days: 7, endDate: '2026-08-05', force: 'true' }, req);
    controller.getDistribution({ dim: 'stale', limit: 20, date: '2026-08-05', force: 'true' }, req);
    controller.getTopOffenders({ limit: 10, date: '2026-08-05', force: 'true' }, req);

    expect(service.getKpis).toHaveBeenCalledWith('2026-08-05', true);
    expect(service.getTrend).toHaveBeenCalledWith(7, '2026-08-05', true);
    expect(service.getDistribution).toHaveBeenCalledWith('stale', 20, true, '2026-08-05');
    expect(service.getTopOffenders).toHaveBeenCalledWith(10, true, '2026-08-05');
  });

  it('anchors stale distribution and offenders to the requested business date', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = { $queryRawUnsafe: queryRaw } as unknown as PrismaService;

    await loadOverviewDistribution(prisma, 'stale', 20, '2026-08-05', true);
    expect(queryRaw.mock.calls[0]?.[1]).toBe('2026-08-05');
    expect(queryRaw.mock.calls[0]?.at(-1)).toBe('2026-08-05');

    queryRaw.mockClear();
    await loadTopOffenders(prisma, 10, '2026-08-05');
    expect(queryRaw).toHaveBeenCalledWith(expect.any(String), '2026-07-07', '2026-08-05', 11);
  });
});
