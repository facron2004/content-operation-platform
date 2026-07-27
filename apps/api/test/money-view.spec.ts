import { describe, it, expect } from 'vitest';
import {
  MONEY_FEN_TO_FLOAT,
  toMoneyView,
  applyMoneyView
} from '../../../packages/shared/src/money-view';

describe('money-view (Phase 5/6 读路径)', () => {
  describe('MONEY_FEN_TO_FLOAT', () => {
    it('推导自 MONEY_FIELDS 且覆盖关键金额列', () => {
      expect(MONEY_FEN_TO_FLOAT['paidAmountFen']).toBe('paidAmount');
      expect(MONEY_FEN_TO_FLOAT['gmvFen']).toBe('gmv');
      expect(MONEY_FEN_TO_FLOAT['budgetFen']).toBe('budget');
      expect(MONEY_FEN_TO_FLOAT['walletBalanceFen']).toBe('walletBalance');
    });
  });

  describe('toMoneyView 单条记录', () => {
    it('bigint Fen → 字符串 + Display，旧 Float 已移除（Phase 6）', () => {
      const row = { id: 1, paidAmount: 39.9, paidAmountFen: 3990n, refundAmountFen: 0n };
      const out = toMoneyView(row) as Record<string, unknown>;
      expect(out.paidAmountFen).toBe('3990');
      expect(out.paidAmountDisplay).toBe('39.90');
      expect(out.refundAmountFen).toBe('0');
      expect(out.refundAmountDisplay).toBe('0.00');
      expect(out.paidAmount).toBeUndefined(); // 旧 Float 已删除
    });

    it('number Fen（经 BigIntSerializer 转换后）同样字符串化 + Display，旧 Float 移除', () => {
      const row = { gmv: 12.34, gmvFen: 1234 };
      const out = toMoneyView(row) as Record<string, unknown>;
      expect(out.gmvFen).toBe('1234');
      expect(out.gmvDisplay).toBe('12.34');
      expect(out.gmv).toBeUndefined();
    });

    it('负数与超大分正确展示，旧 Float 移除', () => {
      const row = { totalGmv: -2.26, totalGmvFen: -226n, otherBig: 9007199254740993n };
      const out = toMoneyView(row) as Record<string, unknown>;
      expect(out.totalGmvFen).toBe('-226');
      expect(out.totalGmvDisplay).toBe('-2.26');
      expect(out.otherBig).toBe(9007199254740993n); // 非 money 字段不动
      expect(out.totalGmv).toBeUndefined();
    });

    it('Fen 为 null → Display 为 0.00，值保持 null', () => {
      const row = { budget: null, budgetFen: null };
      const out = toMoneyView(row) as Record<string, unknown>;
      expect(out.budgetFen).toBeNull();
      expect(out.budgetDisplay).toBe('0.00');
      expect(out.budget).toBeUndefined();
    });

    it('无 money 字段时返回原引用（不拷贝）', () => {
      const row = { id: 7, name: 'x' };
      expect(toMoneyView(row)).toBe(row);
    });

    it('未知字段与多个 Fen 并存互不干扰，旧 Float 一并移除', () => {
      const row = {
        id: 1,
        name: 'p',
        originalPrice: 99.9,
        originalPriceFen: 9990n,
        salePrice: 49.9,
        salePriceFen: 4990n,
        note: 'keep'
      };
      const out = toMoneyView(row) as Record<string, unknown>;
      expect(out.originalPriceFen).toBe('9990');
      expect(out.originalPriceDisplay).toBe('99.90');
      expect(out.salePriceFen).toBe('4990');
      expect(out.salePriceDisplay).toBe('49.90');
      expect(out.note).toBe('keep');
      expect(out.name).toBe('p');
      expect(out.originalPrice).toBeUndefined();
      expect(out.salePrice).toBeUndefined();
    });
  });

  describe('applyMoneyView 递归', () => {
    it('数组逐元素增强，旧 Float 移除', () => {
      const arr = [{ gmv: 1.0, gmvFen: 100n }, { gmv: 2.5, gmvFen: 250n }];
      const out = applyMoneyView(arr) as Array<Record<string, unknown>>;
      expect(out[0].gmvFen).toBe('100');
      expect(out[0].gmvDisplay).toBe('1.00');
      expect(out[0].gmv).toBeUndefined();
      expect(out[1].gmvFen).toBe('250');
      expect(out[1].gmvDisplay).toBe('2.50');
      expect(out[1].gmv).toBeUndefined();
    });

    it('嵌套对象（含 {success,data} 信封）正确增强 data 内实体，旧 Float 移除', () => {
      const payload = {
        success: true,
        data: {
          list: [{ paidAmount: 39.9, paidAmountFen: 3990n }],
          total: { totalGmv: 100.0, totalGmvFen: 10000n }
        }
      };
      const out = applyMoneyView(payload) as Record<string, any>;
      expect(out.success).toBe(true);
      expect(out.data.list[0].paidAmountFen).toBe('3990');
      expect(out.data.list[0].paidAmountDisplay).toBe('39.90');
      expect(out.data.list[0].paidAmount).toBeUndefined();
      expect(out.data.total.totalGmvFen).toBe('10000');
      expect(out.data.total.totalGmvDisplay).toBe('100.00');
      expect(out.data.total.totalGmv).toBeUndefined();
    });

    it('标量/空值原样返回', () => {
      expect(applyMoneyView(null)).toBeNull();
      expect(applyMoneyView(42)).toBe(42);
      expect(applyMoneyView('s')).toBe('s');
      expect(applyMoneyView(undefined)).toBeUndefined();
    });
  });
});
