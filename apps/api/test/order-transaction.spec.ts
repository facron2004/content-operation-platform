import { describe, expect, it, vi } from 'vitest';
import { OrderTransactionService } from '../src/order-center/order-transaction.service';
import type { PrismaService } from '../src/prisma/prisma.service';

function createOrder(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 'order-1',
    packageId: 'package-1',
    merchantId: 'merchant-1',
    paidTime: new Date('2026-08-11T01:00:00.000Z'),
    status: 'paid',
    orderAmountFen: 10000n,
    paidAmountFen: 10000n,
    refundAmountFen: null,
    verifyAmountFen: null,
    ...overrides
  };
}

function createService(overrides: Record<string, unknown> = {}) {
  const tx = {
    orderHeader: {
      findUnique: vi.fn().mockResolvedValue(createOrder()),
      update: vi.fn().mockResolvedValue(undefined)
    },
    verificationRecord: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async (args) => ({
        id: 'verification-1',
        verificationNo: 'ver-1',
        orderId: args.data.orderId,
        packageId: args.data.packageId,
        merchantId: args.data.merchantId,
        storeId: args.data.storeId,
        quantity: args.data.quantity,
        amountFen: args.data.amountFen,
        verificationCode: args.data.verificationCode,
        operatorId: args.data.operatorId,
        status: args.data.status,
        verifiedAt: args.data.verifiedAt,
        reversalReason: null,
        createdAt: new Date('2026-08-11T02:00:00.000Z')
      }))
    },
    refundRequest: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn().mockImplementation(async (args) => ({
        id: 'refund-1',
        refundNo: 'rf-1',
        orderId: args.data.orderId,
        refundType: args.data.refundType,
        refundAmountFen: args.data.refundAmountFen,
        status: args.data.status,
        reason: args.data.reason,
        requestedBy: args.data.requestedBy,
        approvedBy: null,
        thirdPartyRefundId: null,
        requestedAt: new Date('2026-08-11T03:00:00.000Z'),
        completedAt: null,
        createdAt: new Date('2026-08-11T03:00:00.000Z')
      })),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0)
    },
    orderStateHistory: { create: vi.fn() },
    $transaction: vi.fn(async (callback) => callback(tx)),
    ...overrides
  } as unknown as PrismaService;
  const inventory = { restore: vi.fn() } as never;
  const outbox = { publishEvent: vi.fn().mockResolvedValue('event-1') } as never;
  return { service: new OrderTransactionService(tx as unknown as PrismaService, inventory, outbox), tx, inventory, outbox };
}

describe('order transaction core', () => {
  it('核销会写入记录、更新订单状态并发布事件', async () => {
    const { service, tx, outbox } = createService();

    const result = await service.verify(
      'order-1',
      { quantity: 1, reason: '现场扫码' },
      { userId: 'admin', username: 'admin' },
      'idem-verify-1'
    );

    expect(result.order).toMatchObject({ orderId: 'order-1', status: 'verified', verifyAmountFen: '10000' });
    expect(tx.verificationRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountFen: 10000n }) })
    );
    expect(tx.orderHeader.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'verified', verifyAmountFen: 10000n }) })
    );
    expect(tx.orderStateHistory.create).toHaveBeenCalledOnce();
    expect(outbox.publishEvent).toHaveBeenCalledWith(
      tx,
      'OrderHeader',
      'order-1',
      'order.verified',
      expect.objectContaining({ amountFen: '10000' })
    );
  });

  it('退款申请只进入退款中，不提前伪造已退款金额', async () => {
    const { service, tx } = createService({
      orderHeader: {
        findUnique: vi.fn().mockResolvedValue(createOrder({ status: 'verified', verifyAmountFen: 10000n })),
        update: vi.fn().mockResolvedValue(undefined)
      }
    });

    const result = await service.requestRefund(
      'order-1',
      { refundType: 'full', reason: '用户未使用' },
      { userId: 'admin' },
      'idem-refund-1'
    );

    expect(result).toMatchObject({ status: 'requested', refundAmountFen: '10000' });
    expect(tx.orderHeader.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'refunding' } })
    );
    expect(tx.refundRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ refundAmountFen: 10000n, status: 'requested' }) })
    );
  });

  it('完成退款时才更新退款金额，并可通过库存边界服务回补', async () => {
    const refund = {
      id: 'refund-1',
      refundNo: 'rf-1',
      orderId: 'order-1',
      refundType: 'full',
      refundAmountFen: 10000n,
      status: 'approved',
      reason: '用户未使用',
      requestedBy: 'admin',
      approvedBy: 'admin',
      thirdPartyRefundId: null,
      requestedAt: new Date('2026-08-11T03:00:00.000Z'),
      completedAt: null,
      createdAt: new Date('2026-08-11T03:00:00.000Z'),
      updatedAt: new Date('2026-08-11T03:00:00.000Z')
    };
    const { service, tx, inventory } = createService({
      orderHeader: {
        findUnique: vi.fn().mockResolvedValue(createOrder({ status: 'refunding' })),
        update: vi.fn().mockResolvedValue(undefined)
      },
      refundRequest: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(refund),
        update: vi.fn().mockResolvedValue({ ...refund, status: 'completed', completedAt: new Date() }),
        count: vi.fn().mockResolvedValue(0)
      }
    });

    const result = await service.completeRefund(
      'refund-1',
      { thirdPartyRefundId: 'mock-provider-1', restoreInventoryQuantity: 1 },
      { userId: 'admin' },
      'idem-refund-complete-1'
    );

    expect(result.status).toBe('completed');
    expect(inventory.restore).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ packageId: 'package-1', businessId: 'refund-1', quantity: 1 })
    );
    expect(tx.orderHeader.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ refundAmountFen: 10000n, status: 'refunded' }) })
    );
  });
});
