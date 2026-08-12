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
        aggregate: vi.fn().mockResolvedValue({ _sum: { paidAmountFen: 26700n } })
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
      verifyAmountFen: '8900'
    });
    expect(result.pagination).toMatchObject({ total: 3, hasMore: true });
    expect(result.summary).toMatchObject({
      totalOrders: 3,
      paidOrders: 3,
      verifiedOrders: 3,
      refundedOrders: 3,
      paidAmountFen: '26700'
    });
  });
});
