import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ProductCenterService } from '../src/product-center/product-center.service';

function createProductRow() {
  return {
    packageId: 'package-1',
    packageName: '深圳湾套餐',
    packageType: 'bargain',
    merchantId: 'merchant-1',
    merchantName: '南方民居',
    areaName: '南山区',
    category: '餐饮',
    saleStatus: 'on_sale',
    stockTotal: 20,
    stockLeft: 5,
    originalPriceFen: 19900n,
    salePriceFen: 9900n,
    welfarePriceFen: null,
    startTime: new Date('2026-08-01T00:00:00.000Z'),
    endTime: new Date('2026-08-31T00:00:00.000Z'),
    updatedAt: new Date('2026-08-11T00:00:00.000Z')
  };
}

describe('product center', () => {
  it('maps stock levels and latest inventory snapshot', async () => {
    const prisma = {
      contentPackage: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi.fn().mockResolvedValue([createProductRow()]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { stockTotal: 20, stockLeft: 5 } })
      },
      salesSnapshot: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { packageId: 'package-1', snapshotTime: new Date('2026-08-10T00:00:00.000Z') }
          ])
      }
    } as unknown as PrismaService;
    const service = new ProductCenterService(prisma);

    const result = await service.listProducts({
      page: 1,
      pageSize: 20,
      inventoryStatus: 'all'
    });

    expect(result.items[0]).toMatchObject({
      packageId: 'package-1',
      inventoryStatus: 'low',
      salePriceFen: '9900',
      lastSnapshotAt: '2026-08-10T00:00:00.000Z'
    });
    expect(result.summary).toMatchObject({
      totalSkus: 2,
      lowStockSkus: 2,
      outOfStockSkus: 2,
      stockTotal: 20,
      stockLeft: 5
    });
  });
});
