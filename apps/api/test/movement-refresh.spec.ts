import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { MovementSkuRow } from '../src/movement/movement.types';

const movementMocks = vi.hoisted(() => ({
  computeMovingSkus: vi.fn(),
  computeStagnantSkus: vi.fn(),
  loadMovementToday: vi.fn()
}));

vi.mock('../src/movement/movement-list', async () => {
  const actual = await vi.importActual<typeof import('../src/movement/movement-list')>(
    '../src/movement/movement-list'
  );
  return {
    ...actual,
    computeMovingSkus: movementMocks.computeMovingSkus,
    computeStagnantSkus: movementMocks.computeStagnantSkus
  };
});

vi.mock('../src/movement/movement-today', () => ({
  loadMovementToday: movementMocks.loadMovementToday
}));

import { MovementController } from '../src/movement/movement.controller';
import { MovementService } from '../src/movement/movement.service';

function row(packageId: string): MovementSkuRow {
  return {
    packageId,
    packageName: packageId,
    merchantId: 'merchant-1',
    merchantName: '测试商家',
    areaName: null,
    category: '测试',
    salePrice: 10,
    stockLeft: 1,
    stockTotal: 2,
    lastSalesDate: '2026-08-05',
    daysSinceLastSale: 0,
    staleBucket: 'normal',
    recent30dSalesQty: 1,
    recent30dSalesAmount: 10
  };
}

describe('movement real reload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    movementMocks.loadMovementToday.mockResolvedValue({ date: '2026-08-05' });
    movementMocks.computeMovingSkus
      .mockResolvedValueOnce([row('moving-cached')])
      .mockResolvedValueOnce([row('moving-forced')]);
    movementMocks.computeStagnantSkus
      .mockResolvedValueOnce([row('stagnant-cached')])
      .mockResolvedValueOnce([row('stagnant-forced')]);
  });

  it('lets an authorized force signal reach today, moving and stagnant services', () => {
    const service = {
      getToday: vi.fn(),
      listMoving: vi.fn(),
      listStagnant: vi.fn()
    } as unknown as MovementService;
    const controller = new MovementController(service, {} as PrismaService);
    const req = {
      user: { userId: 'admin', username: 'admin', roles: ['admin'] },
      query: { force: 'true' }
    } as unknown as Request;

    controller.today({ date: '2026-08-05', force: 'true' }, req);
    controller.moving({ days: 7, page: 1, pageSize: 20, force: 'true' }, req);
    controller.stagnant(
      { bucket: 'stale_30d', sort: 'lastSalesDateAsc', page: 1, pageSize: 20, force: 'true' },
      req
    );

    expect(service.getToday).toHaveBeenCalledWith('2026-08-05', true);
    expect(service.listMoving).toHaveBeenCalledWith(expect.objectContaining({ days: 7 }), true);
    expect(service.listStagnant).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'stale_30d' }),
      true
    );
  });

  it('reuses ordinary list TTL values and recomputes both active lists when forced', async () => {
    const service = new MovementService({} as PrismaService);
    const movingQuery = { days: 7 as const, page: 1, pageSize: 20 };
    const stagnantQuery = {
      bucket: 'stale_30d' as const,
      sort: 'lastSalesDateAsc' as const,
      page: 1,
      pageSize: 20
    };

    const firstMoving = await service.listMoving(movingQuery);
    const cachedMoving = await service.listMoving(movingQuery);
    const forcedMoving = await service.listMoving(movingQuery, true);
    const firstStagnant = await service.listStagnant(stagnantQuery);
    const cachedStagnant = await service.listStagnant(stagnantQuery);
    const forcedStagnant = await service.listStagnant(stagnantQuery, true);

    expect(firstMoving.items[0]?.packageId).toBe('moving-cached');
    expect(cachedMoving.items[0]?.packageId).toBe('moving-cached');
    expect(forcedMoving.items[0]?.packageId).toBe('moving-forced');
    expect(firstStagnant.items[0]?.packageId).toBe('stagnant-cached');
    expect(cachedStagnant.items[0]?.packageId).toBe('stagnant-cached');
    expect(forcedStagnant.items[0]?.packageId).toBe('stagnant-forced');
    expect(movementMocks.computeMovingSkus).toHaveBeenCalledTimes(2);
    expect(movementMocks.computeStagnantSkus).toHaveBeenCalledTimes(2);
  });

  it('passes the force choice from MovementService into the today TTL loader', async () => {
    const service = new MovementService({} as PrismaService);

    await service.getToday('2026-08-05');
    await service.getToday('2026-08-05', true);

    expect(movementMocks.loadMovementToday).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      '2026-08-05',
      false
    );
    expect(movementMocks.loadMovementToday).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      '2026-08-05',
      true
    );
  });
});
