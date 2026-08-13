import { describe, expect, it } from 'vitest';
import { queryOrderDetails } from '../src/data-analysis/data-analysis-detail.query';

describe('data-analysis detail query layer', () => {
  it('uses paidTime bounds, caps rows, masks PII, and converts fen to yuan', async () => {
    let captured: { sql: string; args: unknown[] } | undefined;
    const prisma = {
      $queryRawUnsafe: async <T = unknown>(sql: string, ...args: unknown[]) => {
        captured = { sql, args };
        return [
          {
            merchantName: '商家A',
            orderId: 'internal-1',
            orderCode: ' DISPLAY-1 ',
            packageName: '套餐A',
            memberNickname: '昵称A',
            memberPhone: '13800138000',
            paidAmountFen: 12345n,
            orderAmountFen: 15000n,
            walletAmountFen: 500n,
            pointUsed: 2,
            refundAmountFen: 100n,
            coupon: ' coupon ',
            salesman: '业务员A',
            parentSalesman: null,
            status: 'paid',
            paidTime: '2026-07-02T01:02:03.123Z',
            verifyTime: null
          },
          {
            merchantName: '商家B',
            orderId: 'internal-2',
            orderCode: null,
            packageName: null,
            memberNickname: null,
            memberPhone: null,
            paidAmountFen: 1n,
            orderAmountFen: 1n,
            walletAmountFen: 0n,
            pointUsed: 0,
            refundAmountFen: 0n,
            coupon: null,
            salesman: null,
            parentSalesman: null,
            status: 'paid',
            paidTime: '2026-07-02 02:00:00',
            verifyTime: null
          }
        ] as T;
      }
    };

    await expect(queryOrderDetails(prisma, '2026-07-02', '2026-07-02', 1)).resolves.toEqual({
      truncated: true,
      rows: [
        {
          merchantName: '商家A',
          orderId: 'DISPLAY-1',
          packageName: '套餐A',
          memberLabel: '*******8000',
          paidAmount: 123.45,
          orderAmount: 150,
          walletAmount: 5,
          pointUsed: 2,
          refundAmount: 1,
          coupon: 'coupon',
          salesman: '业务员A',
          parentSalesman: '',
          statusLabel: '已退款',
          orderType: '虚拟卡券',
          verifyLabel: '已退款',
          paidTime: '2026-07-02 01:02:03',
          verifyTime: ''
        }
      ]
    });
    expect(captured?.sql).toContain('oh."paidTime"');
    expect(captured?.args).toHaveLength(3);
    expect(captured?.args[2]).toBe(2);
  });

  it('classifies verify states exclusively and recognizes refunds by actual amount', async () => {
    const base = {
      merchantName: '商家',
      packageName: null,
      memberNickname: null,
      memberPhone: null,
      paidAmountFen: 1000n,
      orderAmountFen: 1000n,
      walletAmountFen: 0n,
      pointUsed: 0,
      coupon: null,
      salesman: null,
      parentSalesman: null,
      paidTime: '2026-07-02 02:00:00'
    };
    const prisma = {
      $queryRawUnsafe: async <T = unknown>() =>
        [
          {
            ...base,
            orderId: 'verified',
            orderCode: null,
            status: 'paid',
            refundAmountFen: 0n,
            verifyTime: '2026-07-03 02:00:00'
          },
          {
            ...base,
            orderId: 'refunded',
            orderCode: null,
            status: 'paid',
            refundAmountFen: 100n,
            verifyTime: null
          },
          {
            ...base,
            orderId: 'expired',
            orderCode: null,
            status: 'cancelled',
            refundAmountFen: 0n,
            verifyTime: null
          },
          {
            ...base,
            orderId: 'pending',
            orderCode: null,
            status: 'paid',
            refundAmountFen: 0n,
            verifyTime: null
          }
        ] as T
    };

    const result = await queryOrderDetails(prisma, '2026-07-02', '2026-07-02', 10);

    expect(result.rows.map((row) => [row.orderId, row.verifyLabel])).toEqual([
      ['verified', '已核销'],
      ['refunded', '已退款'],
      ['expired', '已过期'],
      ['pending', '待核销']
    ]);
    expect(result.rows.find((row) => row.orderId === 'refunded')).toMatchObject({
      refundAmount: 1,
      statusLabel: '已退款'
    });
  });
});
