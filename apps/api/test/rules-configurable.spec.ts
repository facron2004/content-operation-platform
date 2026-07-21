import type { ContentPackage, InventoryTrendPoint, StrategyType } from '@content/shared';
import { describe, expect, it } from 'vitest';
import { auditCopyText } from '../src/domain/copy-rules';
import { buildInventoryFlag, normalizeInventoryTrend } from '../src/content/inventory-flags';
import {
  mergeRuleConfig,
  DEFAULT_PROMOTION_RULES,
  type PromotionRuleConfig
} from '../src/domain/rules-defaults';

// ==================== mergeRuleConfig ====================

describe('mergeRuleConfig (规则回退)', () => {
  it('overrides top-level keys but keeps unset defaults', () => {
    const merged = mergeRuleConfig<PromotionRuleConfig>('promotion', {
      scoreLevel: { s: 99, a: 80, b: 70, c: 60 }
    });
    expect(merged.scoreLevel).toEqual({ s: 99, a: 80, b: 70, c: 60 });
    expect(merged.baseScoreByStockRatio).toEqual(DEFAULT_PROMOTION_RULES.baseScoreByStockRatio);
    expect(merged.statusScoreDelta).toEqual(DEFAULT_PROMOTION_RULES.statusScoreDelta);
  });

  it('returns defaults when payload is null', () => {
    expect(mergeRuleConfig('promotion', null)).toEqual(DEFAULT_PROMOTION_RULES);
  });
});

// ==================== 领域函数可配置性 ====================

const trend = (items: Array<[string, number]>): InventoryTrendPoint[] =>
  normalizeInventoryTrend(
    items.map(([date, remainingStock]) => ({
      date,
      snapshotTime: `${date}T10:00:00.000Z`,
      remainingStock
    }))
  );

describe('buildInventoryFlag 阈值可配置', () => {
  const input = {
    currentStockLeft: 5,
    saleStatus: 'selling' as const,
    normalizedTrend: trend([
      ['2026-05-13', 5],
      ['2026-05-14', 5]
    ])
  };

  it('default rules: 2 未售罄天 -> unsold_2d (warning)', () => {
    const result = buildInventoryFlag(input);
    expect(result.inventoryFlag).toBe('unsold_2d');
    expect(result.inventoryFlagLevel).toBe('warning');
  });

  it('stricter rules (backlogDays/slowDays=1) -> unsold_3d_slow with dynamic label', () => {
    const strict = buildInventoryFlag(input, {
      backlogDays: 1,
      slowDays: 1,
      stale7Days: 7,
      stale15Days: 15,
      stale30Days: 30,
      stale60Days: 60
    });
    expect(strict.inventoryFlag).toBe('unsold_3d_slow');
    expect(strict.inventoryFlagLevel).toBe('danger');
    expect(strict.inventoryFlagLabel).toBe('连续1天未售罄');
  });

  it('looser rules (backlogDays/slowDays=99) -> unsold_today (info)', () => {
    const loose = buildInventoryFlag(input, {
      backlogDays: 99,
      slowDays: 99,
      stale7Days: 7,
      stale15Days: 15,
      stale30Days: 30,
      stale60Days: 60
    });
    expect(loose.inventoryFlag).toBe('unsold_today');
    expect(loose.inventoryFlagLevel).toBe('info');
  });
});

describe('auditCopyText 禁用词可配置', () => {
  const basePkg = {
    packageId: 'P1',
    packageName: '测试套餐',
    packageType: 'welfare',
    merchantId: 'M1',
    merchantName: '测试门店',
    areaId: 'A1',
    areaName: '区域',
    category: '餐饮',
    originalPrice: 100,
    salePrice: 50,
    commissionRate: 0.1,
    grossProfit: 5,
    stockTotal: 100,
    stockLeft: 10,
    startTime: '2026-01-01T00:00:00.000Z',
    endTime: '2026-12-31T00:00:00.000Z',
    useRules: [],
    sellingPoints: [],
    fallbackPackageId: null,
    miniProgramPath: '/',
    saleStatus: 'selling',
    merchantCooperationScore: 80,
    areaMatchScore: 80,
    timeMatchScore: 80,
    historyScore: 80
  } as ContentPackage;

  const copy = {
    title: '特价来袭',
    body: '今日特价不容错过',
    strategyType: 'launch' as StrategyType
  };

  it('default forbidden words do not include 特价', () => {
    const result = auditCopyText(basePkg, copy);
    expect(result.riskTips.some((tip) => tip.includes('特价'))).toBe(false);
  });

  it('custom forbiddenWords 命中 -> 标记为高风险', () => {
    const result = auditCopyText(basePkg, copy, { forbiddenWords: ['特价'] });
    expect(result.riskTips.some((tip) => tip.includes('特价'))).toBe(true);
    expect(result.riskLevel).toBe('high');
  });
});
