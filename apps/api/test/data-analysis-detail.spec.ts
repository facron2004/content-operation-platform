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
          statusLabel: '已发货',
          orderType: '虚拟卡券',
          verifyLabel: '待核销',
          paidTime: '2026-07-02 01:02:03',
          verifyTime: ''
        }
      ]
    });
    expect(captured?.sql).toContain('oh."paidTime"');
    expect(captured?.args).toHaveLength(3);
    expect(captured?.args[2]).toBe(2);
  });
});
