import { describe, expect, it } from 'vitest';
import { MONEY_FIELDS, withMoneyFen, fenColumnsForRawWrite } from '@content/shared';
import { moneyFenExtension } from '../src/prisma/money-fen-extension';

// VNext 金额精度治理（PRD §7.4）Phase 3：双写映射与 ORM 扩展契约测试。
describe('money-fen Phase 3 dual-write (PRD §7.4)', () => {
  describe('MONEY_FIELDS mapping', () => {
    it('covers all 10 models with 44 fen columns total', () => {
      const models = Object.keys(MONEY_FIELDS);
      expect(models).toHaveLength(10);
      const totalColumns = models.reduce((n, m) => n + Object.keys(MONEY_FIELDS[m]).length, 0);
      expect(totalColumns).toBe(44);
    });

    it('every fen column name is floatField + "Fen" or an explicit rename', () => {
      for (const [model, map] of Object.entries(MONEY_FIELDS)) {
        for (const [floatField, fenField] of Object.entries(map)) {
          expect(fenField, `${model}.${floatField}`).toMatch(/Fen$/);
        }
      }
    });
  });

  describe('withMoneyFen', () => {
    it('injects fen for money fields present in data', () => {
      const out = withMoneyFen('OrderHeader', {
        orderId: 'o1',
        paidAmount: 39.9,
        refundAmount: 0
      });
      expect(out.paidAmountFen).toBe(3990n);
      expect(out.refundAmountFen).toBe(0n);
      expect(out.orderId).toBe('o1');
    });

    it('does not touch absent money fields (partial update safety)', () => {
      const out = withMoneyFen('OrderHeader', { paidAmount: 10 });
      expect(out.paidAmountFen).toBe(1000n);
      expect('orderAmountFen' in out).toBe(false);
      expect('refundAmountFen' in out).toBe(false);
    });

    it('maps null/undefined money value to null fen', () => {
      const out = withMoneyFen('ContentPackage', { welfarePrice: null });
      expect(out.welfarePriceFen).toBeNull();
    });

    it('handles classic float error: 0.1 + 0.2 yuan → 30 fen', () => {
      const out = withMoneyFen('Member', { totalGmv: 0.1 + 0.2 });
      expect(out.totalGmvFen).toBe(30n);
    });

    it('returns data unchanged for unknown model', () => {
      const data = { price: 1.23 };
      expect(withMoneyFen('NotAModel', data)).toBe(data);
    });
  });

  describe('fenColumnsForRawWrite', () => {
    it('returns only fen columns for present float fields', () => {
      const cols = fenColumnsForRawWrite('MerchantDailyMetrics', {
        paidAmountOnline: 115.36,
        refundAmount: null,
        orderCount: 5
      });
      expect(cols).toEqual({ paidAmountOnlineFen: 11536n, refundAmountFen: null });
    });

    it('returns empty object for unknown model', () => {
      expect(fenColumnsForRawWrite('Nope', { a: 1 })).toEqual({});
    });
  });

  describe('moneyFenExtension ($allOperations interceptor)', () => {
    const handler = (
      moneyFenExtension as {
        query: {
          $allModels: {
            $allOperations: (ctx: {
              model: string;
              operation: string;
              args: unknown;
              query: (args: unknown) => Promise<unknown>;
            }) => Promise<unknown>;
          };
        };
      }
    ).query.$allModels.$allOperations;

    const passthrough = async (args: unknown) => args;

    it('injects fen on create data', async () => {
      const result = (await handler({
        model: 'Member',
        operation: 'create',
        args: { data: { memberId: 'm1', totalGmv: 39.9 } },
        query: passthrough
      })) as { data: Record<string, unknown> };
      expect(result.data.totalGmvFen).toBe(3990n);
    });

    it('injects fen on update data (partial fields only)', async () => {
      const result = (await handler({
        model: 'Member',
        operation: 'update',
        args: { where: { memberId: 'm1' }, data: { totalGmv: 10.01 } },
        query: passthrough
      })) as { data: Record<string, unknown> };
      expect(result.data.totalGmvFen).toBe(1001n);
      expect('walletBalanceFen' in result.data).toBe(false);
    });

    it('injects fen on both branches of upsert', async () => {
      const result = (await handler({
        model: 'ContentPackage',
        operation: 'upsert',
        args: {
          where: { id: 'p1' },
          create: { salePrice: 39.9 },
          update: { salePrice: 29.9 }
        },
        query: passthrough
      })) as { create: Record<string, unknown>; update: Record<string, unknown> };
      expect(result.create.salePriceFen).toBe(3990n);
      expect(result.update.salePriceFen).toBe(2990n);
    });

    it('injects fen on every row of createMany array data', async () => {
      const result = (await handler({
        model: 'OrderHeader',
        operation: 'createMany',
        args: { data: [{ paidAmount: 1.1 }, { paidAmount: 2.2 }] },
        query: passthrough
      })) as { data: Array<Record<string, unknown>> };
      expect(result.data[0].paidAmountFen).toBe(110n);
      expect(result.data[1].paidAmountFen).toBe(220n);
    });

    it('leaves non-money models untouched', async () => {
      const args = { data: { name: 'x', someAmount: 1.5 } };
      const result = await handler({
        model: 'CopyTask',
        operation: 'create',
        args,
        query: passthrough
      });
      expect(result).toBe(args);
    });

    it('passes through read operations without data', async () => {
      const args = { where: { memberId: 'm1' } };
      const result = await handler({
        model: 'Member',
        operation: 'findUnique',
        args,
        query: passthrough
      });
      expect(result).toBe(args);
    });
  });
});
