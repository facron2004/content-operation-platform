import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { OrderCenterService } from '../src/order-center/order-center.service';

function createOrderRow() {
  return {
    orderId: 'order-1',
    orderCode: 'K202608110001',
    memberId: 'member-1',
    packageId: 'package-1',
    merchantId: 'merchant-1',
    merchantName: '南方民居',
    orderTime: new Date('2026-08-11T01:00:00.000Z'),
    paidTime: new Date('2026-08-11T01:01:00.000Z'),
    verifyTime: new Date('2026-08-11T02:00:00.000Z'),
    refundTime: null,
    status: 'verified',
    channel: 'online',
    orderAmountFen: 9900n,
    paidAmountFen: 8900n,
    paidAmountWalletFen: 1000n,
    refundAmountFen: null,
    verifyAmountFen: 8900n
  };
}

describe('order center', () => {
  it('composes order rows with member/package names and fen summaries', async () => {
    const prisma = {
      orderHeader: {
        count: vi.fn().mockResolvedValue(3),
        findMany: vi.fn().mockResolvedValue([createOrderRow()]),
        aggregate: vi.fn().mockResolvedValue({
          _sum: { paidAmountFen: 26700n, paidAmountWalletFen: 3000n }
        })
      },
      member: {
        findMany: vi.fn().mockResolvedValue([{ memberId: 'member-1', nickname: '小惠' }])
      },
      contentPackage: {
        findMany: vi.fn().mockResolvedValue([{ packageId: 'package-1', packageName: '深圳湾套餐' }])
      }
    } as unknown as PrismaService;
    const service = new OrderCenterService(prisma);

    const result = await service.listOrders({ page: 1, pageSize: 20 });

    expect(result.items[0]).toMatchObject({
      orderId: 'order-1',
      memberName: '小惠',
      packageName: '深圳湾套餐',
      paidAmountFen: '8900',
      paidAmountWalletFen: '1000',
      verifyAmountFen: '8900'
    });
    expect(result.pagination).toMatchObject({ total: 3, hasMore: true });
    expect(result.summary).toMatchObject({
      totalOrders: 3,
      paidOrders: 3,
      verifiedOrders: 3,
      refundedOrders: 3,
      paidAmountFen: '26700',
      paidAmountWalletFen: '3000'
    });
  });

  it('filters orders by the exact package category before counting and paging', async () => {
    const packageFindMany = vi
      .fn()
      .mockResolvedValueOnce([{ packageId: 'package-1' }])
      .mockResolvedValueOnce([{ packageId: 'package-1', packageName: '深圳湾套餐' }]);
    const orderFindMany = vi.fn().mockResolvedValue([createOrderRow()]);
    const prisma = {
      orderHeader: {
        count: vi.fn().mockResolvedValue(1),
        findMany: orderFindMany,
        aggregate: vi.fn().mockResolvedValue({
          _sum: { paidAmountFen: 8900n, paidAmountWalletFen: 1000n }
        })
      },
      member: {
        findMany: vi.fn().mockResolvedValue([{ memberId: 'member-1', nickname: '小惠' }])
      },
      contentPackage: { findMany: packageFindMany }
    } as unknown as PrismaService;
    const service = new OrderCenterService(prisma);

    await service.listOrders({ page: 1, pageSize: 20, category: '餐饮' });

    expect(packageFindMany).toHaveBeenNthCalledWith(1, {
      where: { category: '餐饮' },
      select: { packageId: true }
    });
    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { packageId: { in: ['package-1'] } } })
    );
  });
});
