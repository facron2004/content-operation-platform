import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { FinanceCenterService } from '../src/finance-center/finance-center.service';

describe('finance center', () => {
  it('keeps order totals in fen and exposes unsupported settlement capabilities', async () => {
    const prisma = {
      orderHeader: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({
            _count: { _all: 12 },
            _sum: {
              paidAmountFen: 12000n,
              paidAmountWalletFen: 800n,
              paidAmountBonusFen: 200n,
              paidAmountCardFen: 300n
            }
          })
          .mockResolvedValueOnce({ _count: { _all: 2 }, _sum: { refundAmountFen: 500n } })
          .mockResolvedValueOnce({ _count: { _all: 8 }, _sum: { verifyAmountFen: 10000n } })
      },
      member: {
        aggregate: vi.fn().mockResolvedValue({
          _count: { _all: 4 },
          _sum: { walletBalanceFen: 2600n, pointsBalance: 90 }
        })
      }
    } as unknown as PrismaService;
    const service = new FinanceCenterService(prisma);

    const result = await service.getDashboard({});

    expect(result.metrics).toMatchObject({
      paidOrderCount: 12,
      paidGrossFen: '12800',
      refundFen: '500',
      verifiedFen: '10000',
      walletAssetFen: '2600',
      pointAsset: 90
    });
    expect(result.channels).toMatchObject({ onlineFen: '12000', walletFen: '800' });
    expect(result.capabilities).toMatchObject({
      orderLedger: 'ready',
      assetLedger: 'not_connected',
      settlement: 'not_connected'
    });
  });

  it('merges payment and refund events into a chronological read-only ledger', async () => {
    const prisma = {
      orderHeader: {
        count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              orderId: 'order-1',
              orderCode: 'K202608110001',
              merchantName: '商家 A',
              memberId: 'member-1',
              paidTime: new Date('2026-08-11T01:00:00.000Z'),
              paidAmountFen: 9000n,
              paidAmountWalletFen: 1000n,
              channel: 'online',
              status: 'paid'
            }
          ])
          .mockResolvedValueOnce([
            {
              orderId: 'order-1',
              orderCode: 'K202608110001',
              merchantName: '商家 A',
              memberId: 'member-1',
              refundTime: new Date('2026-08-11T02:00:00.000Z'),
              refundAmountFen: 300n,
              channel: 'online',
              status: 'refunded'
            }
          ])
      }
    } as unknown as PrismaService;
    const service = new FinanceCenterService(prisma);

    const result = await service.getLedger({ page: 1, pageSize: 20, eventType: 'all' });

    expect(result.pagination).toMatchObject({ total: 2, hasMore: false });
    expect(result.items.map((item) => item.eventType)).toEqual(['refund', 'payment']);
    expect(result.items[0]).toMatchObject({ changeAmountFen: '-300', remark: '订单退款' });
    expect(result.items[1]).toMatchObject({ changeAmountFen: '10000', remark: '订单支付' });
  });
});
