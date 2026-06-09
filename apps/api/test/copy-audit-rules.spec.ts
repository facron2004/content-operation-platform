import { describe, expect, it } from 'vitest';
import type { ContentPackage } from '@content/shared';
import { auditCopyText, generateTemplateCopies } from '../src/domain/copy-rules';
import type { PromotionScore } from '@content/shared';

const basePackage: ContentPackage = {
  packageId: 'PKG-AUDIT',
  packageName: '南山双人火锅套餐',
  packageType: 'welfare',
  merchantId: 'M002',
  merchantName: '川味老火锅',
  areaId: 'A002',
  areaName: '南山科技园',
  category: '餐饮',
  originalPrice: 198,
  salePrice: 79,
  welfarePrice: 59,
  commissionRate: 0.15,
  grossProfit: 12,
  stockTotal: 200,
  stockLeft: 50,
  startTime: '2026-05-20T00:00:00.000Z',
  endTime: '2026-06-20T00:00:00.000Z',
  useRules: ['需提前1天预约', '节假日不可用'],
  sellingPoints: ['锅底任选', '含肥牛虾滑'],
  fallbackPackageId: null,
  miniProgramPath: '/pages/package/detail?id=PKG-AUDIT',
  merchantCooperationScore: 85,
  areaMatchScore: 90,
  timeMatchScore: 88,
  historyScore: 75
};

const basePromotion: PromotionScore = {
  packageId: 'PKG-AUDIT',
  areaId: 'A002',
  score: 82,
  level: 'A',
  status: 'healthy_sales',
  recommendedStrategy: 'sprint',
  reason: '转化率高，核销稳定',
  riskTips: [],
  recommendedChannels: ['wechat_group'],
  copyAngles: ['限时优惠'],
  calculatedAt: '2026-06-01T10:00:00.000Z'
};

describe('auditCopyText - 文案审核规则', () => {
  it('passes clean copy with correct facts', () => {
    const result = auditCopyText(basePackage, {
      title: '南山科技园火锅双人餐',
      body: '川味老火锅双人套餐，原价198，现在只要79，锅底任选含肥牛虾滑。需提前1天预约，节假日不可用。',
      strategyType: 'sprint'
    });

    expect(result.riskLevel).toBe('low');
    expect(result.riskTips).toHaveLength(0);
    expect(result.auditStatus).toBe('pending');
  });

  it('flags all five forbidden words independently', () => {
    const forbiddenWords = ['全网最低', '最后疯抢', '错过后悔', '稳赚', '保证返利'];

    for (const word of forbiddenWords) {
      const result = auditCopyText(basePackage, {
        title: `${word}特惠`,
        body: '正常文案内容79元',
        strategyType: 'sprint'
      });
      expect(result.riskLevel).toBe('high');
      expect(result.riskTips).toContainEqual(expect.stringContaining(word));
    }
  });

  it('flags sold-out package with grab wording', () => {
    const soldOutPkg = { ...basePackage, stockLeft: 0 };
    const result = auditCopyText(soldOutPkg, {
      title: '火锅套餐开抢',
      body: '川味老火锅79元抢购，锅底任选含肥牛虾滑。需提前1天预约，节假日不可用。',
      strategyType: 'sprint'
    });

    expect(result.riskTips).toContainEqual(expect.stringContaining('售罄'));
  });

  it('allows sold-out wording when package is actually sold out', () => {
    const soldOutPkg = { ...basePackage, stockLeft: 0 };
    const result = auditCopyText(soldOutPkg, {
      title: '火锅套餐已售罄',
      body: '川味老火锅79元已售罄，下次开售通知您。锅底任选含肥牛虾滑。需提前1天预约，节假日不可用。',
      strategyType: 'fallback'
    });

    expect(result.riskTips).not.toContainEqual(expect.stringContaining('售罄套餐不得继续宣传可抢'));
  });

  it('flags missing use rules one by one', () => {
    const result = auditCopyText(basePackage, {
      title: '火锅双人餐79',
      body: '川味老火锅超值套餐，锅底任选含肥牛虾滑。',
      strategyType: 'sprint'
    });

    expect(result.riskTips).toContainEqual(expect.stringContaining('需提前1天预约'));
    expect(result.riskTips).toContainEqual(expect.stringContaining('节假日不可用'));
  });

  it('flags invented prices but allows correct ones', () => {
    const badResult = auditCopyText(basePackage, {
      title: '火锅套餐9.9',
      body: '超值9.9元火锅',
      strategyType: 'sprint'
    });
    expect(badResult.riskTips).toContainEqual(expect.stringContaining('价格'));

    const goodResult = auditCopyText(basePackage, {
      title: '火锅套餐79',
      body: '川味老火锅79元，原价198。需提前1天预约，节假日不可用。',
      strategyType: 'sprint'
    });
    expect(goodResult.riskTips).not.toContainEqual(expect.stringContaining('价格'));
  });

  it('medium risk for missing rules only (no forbidden/price/stock issues)', () => {
    const result = auditCopyText(
      { ...basePackage, useRules: ['仅限堂食'], stockLeft: 50 },
      {
        title: '火锅双人餐',
        body: '川味老火锅79元，锅底任选含肥牛虾滑。',
        strategyType: 'sprint'
      }
    );

    expect(result.riskLevel).toBe('medium');
    expect(result.riskTips).toHaveLength(1);
  });
});

describe('generateTemplateCopies - 模板文案生成', () => {
  it('generates exactly the requested number of copies (max 5)', () => {
    const copies3 = generateTemplateCopies(basePackage, basePromotion, {
      packageId: 'PKG-AUDIT',
      channel: 'wechat_group',
      scenario: '日常',
      tone: '真实',
      copyCount: 3
    });
    expect(copies3).toHaveLength(3);

    const copies5 = generateTemplateCopies(basePackage, basePromotion, {
      packageId: 'PKG-AUDIT',
      channel: 'moments',
      scenario: '推广',
      tone: '真实',
      copyCount: 5
    });
    expect(copies5).toHaveLength(5);
  });

  it('caps copy count at 5 even when more are requested', () => {
    const copies = generateTemplateCopies(basePackage, basePromotion, {
      packageId: 'PKG-AUDIT',
      channel: 'wechat_group',
      scenario: '',
      tone: '',
      copyCount: 10
    });
    expect(copies).toHaveLength(5);
  });

  it('assigns distinct version letters A through E', () => {
    const copies = generateTemplateCopies(basePackage, basePromotion, {
      packageId: 'PKG-AUDIT',
      channel: 'wechat_group',
      scenario: '',
      tone: '',
      copyCount: 5
    });

    const versions = copies.map((c) => c.copyVersion);
    expect(versions).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('each copy has unique contentId', () => {
    const copies = generateTemplateCopies(basePackage, basePromotion, {
      packageId: 'PKG-AUDIT',
      channel: 'wechat_group',
      scenario: '',
      tone: '',
      copyCount: 5
    });

    const ids = new Set(copies.map((c) => c.contentId));
    expect(ids.size).toBe(5);
  });

  it('all copies include package price and use rules', () => {
    const copies = generateTemplateCopies(basePackage, basePromotion, {
      packageId: 'PKG-AUDIT',
      channel: 'wechat_group',
      scenario: '日常推荐',
      tone: '真实',
      copyCount: 3,
      createdBy: 'tester'
    });

    for (const copy of copies) {
      expect(copy.body).toContain('79');
      expect(copy.body).toContain('需提前1天预约');
      expect(copy.createdBy).toBe('tester');
      expect(copy.channel).toBe('wechat_group');
    }
  });

  it('uses fallback strategy for sold-out packages', () => {
    const soldOutPkg = { ...basePackage, stockLeft: 0 };
    const soldOutPromotion = { ...basePromotion, status: 'sold_out' as const, recommendedStrategy: 'fallback' as const };

    const [copy] = generateTemplateCopies(soldOutPkg, soldOutPromotion, {
      packageId: 'PKG-AUDIT',
      channel: 'wechat_group',
      scenario: '售罄',
      tone: '真实',
      copyCount: 1
    });

    expect(copy.body).toContain('已售罄');
    expect(copy.body).not.toContain('开抢');
  });
});
