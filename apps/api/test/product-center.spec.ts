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
    currentStock: 7,
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
        aggregate: vi
          .fn()
          .mockResolvedValue({ _sum: { stockTotal: 20, stockLeft: 5, currentStock: 7 } })
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
      initialStock: 20,
      currentStock: 7,
      dailyStock: 5,
      lastSnapshotAt: '2026-08-10T00:00:00.000Z'
    });
    expect(result.summary).toMatchObject({
      totalSkus: 2,
      lowStockSkus: 2,
      outOfStockSkus: 2,
      stockTotal: 20,
      stockLeft: 5,
      initialStock: 20,
      currentStock: 7,
      dailyStock: 5
    });
    expect(prisma.contentPackage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ stockLeft: 'desc' }, { updatedAt: 'desc' }]
      })
    );
  });

  it('applies the selected sale status to the product list and summary', async () => {
    const prisma = {
      contentPackage: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn().mockResolvedValue({
          _sum: { stockTotal: 0, stockLeft: 0, currentStock: 0 }
        })
      },
      salesSnapshot: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as unknown as PrismaService;
    const service = new ProductCenterService(prisma);

    await service.listProducts({
      page: 1,
      pageSize: 20,
      inventoryStatus: 'all',
      saleStatus: 'selling'
    });

    expect(prisma.contentPackage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { saleStatus: 'selling' }
      })
    );
    expect(prisma.contentPackage.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { saleStatus: 'selling' }
      })
    );
    expect(prisma.contentPackage.count).toHaveBeenNthCalledWith(1, {
      where: { saleStatus: 'selling' }
    });
    expect(prisma.contentPackage.count).toHaveBeenNthCalledWith(4, {
      where: { saleStatus: 'selling' }
    });
  });
});
