import { describe, expect, it } from 'vitest';
import type { ContentPackage, PromotionScore } from '@content/shared';
import { auditCopyText, generateTemplateCopies } from '../src/domain/copy-rules';

const pkg: ContentPackage = {
  packageId: 'PKG001',
  packageName: '双人烤肉套餐',
  packageType: 'welfare',
  merchantId: 'M001',
  merchantName: '老张炭火烤肉',
  areaId: 'A001',
  areaName: '宝安中心',
  category: '餐饮',
  originalPrice: 128,
  salePrice: 49.9,
  welfarePrice: 19.9,
  commissionRate: 0.1,
  grossProfit: 8,
  stockTotal: 100,
  stockLeft: 18,
  startTime: '2026-05-11T17:00:00.000Z',
  endTime: '2026-05-11T23:00:00.000Z',
  useRules: ['需提前2小时预约'],
  sellingPoints: ['双人可用', '含牛五花、鸡翅、蔬菜拼盘'],
  fallbackPackageId: 'PKG002',
  miniProgramPath: '/pages/package/detail?id=PKG001',
  merchantCooperationScore: 86,
  areaMatchScore: 88,
  timeMatchScore: 92,
  historyScore: 80
};

const promotion: PromotionScore = {
  packageId: 'PKG001',
  areaId: 'A001',
  score: 88,
  level: 'S',
  status: 'nearly_sold_out',
  recommendedStrategy: 'sprint',
  reason: '库存低、转化高、核销稳定，适合继续推送。',
  riskTips: ['避免使用全网最低、最后疯抢等绝对化表述'],
  recommendedChannels: ['wechat_group', 'moments'],
  copyAngles: ['限量库存', '晚餐场景'],
  calculatedAt: '2026-05-11T18:00:00.000Z'
};

describe('copy generation rules', () => {
  it('generates template copy from package fields without inventing price or stock', () => {
    const [copy] = generateTemplateCopies(pkg, promotion, {
      packageId: 'PKG001',
      channel: 'wechat_group',
      scenario: '库存冲刺',
      tone: '真实群主口吻',
      copyCount: 1,
      createdBy: 'tester'
    });

    expect(copy.title).toContain('宝安中心');
    expect(copy.body).toContain('老张炭火烤肉');
    expect(copy.body).toContain('双人烤肉套餐');
    expect(copy.body).toContain('49.9');
    expect(copy.body).not.toContain('19.9');
    expect(copy.body).toContain('18');
    expect(copy.body).toContain('需提前2小时预约');
    expect(copy.body).not.toContain('全网最低');
  });

  it('does not generate grab wording for sold out packages', () => {
    const [copy] = generateTemplateCopies(
      { ...pkg, stockLeft: 0 },
      { ...promotion, status: 'sold_out', recommendedStrategy: 'fallback' },
      {
        packageId: 'PKG001',
        channel: 'wechat_group',
        scenario: '售罄承接',
        tone: '真实群主口吻',
        copyCount: 1,
        createdBy: 'tester'
      }
    );

    expect(copy.body).toContain('已售罄');
    expect(copy.body).not.toContain('开抢');
  });

  it('flags forbidden words and inconsistent package facts in machine audit', () => {
    const result = auditCopyText(pkg, {
      title: '全网最低福利',
      body: '老张炭火烤肉双人烤肉套餐，福利价9.9，剩余999份，不用预约。',
      strategyType: 'sprint'
    });

    expect(result.riskLevel).toBe('high');
    expect(result.riskTips).toEqual(
      expect.arrayContaining([
        '包含禁用或绝对化表述：全网最低',
        '文案价格与套餐价格不一致',
        '文案库存与实时库存不一致',
        '文案缺少使用限制：需提前2小时预约'
      ])
    );
  });
});
