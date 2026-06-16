import { ConfigService } from '@nestjs/config';
import type { ContentPackage, GenerateCopyRequest, PromotionScore } from '@content/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AICopyService } from '../src/content/ai-copy.service';
import type { PackageDetail } from '../src/content/package-detail.service';

const openAiMocks = vi.hoisted(() => ({
  create: vi.fn()
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: openAiMocks.create
      }
    }
  }))
}));

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
  temporarySalePrice: 39.9,
  commissionRate: 0.1,
  grossProfit: 8,
  stockTotal: 100,
  stockLeft: 18,
  startTime: '2026-05-11T17:00:00.000Z',
  endTime: '2026-05-11T23:00:00.000Z',
  useRules: ['需提前2小时预约', '周末可用'],
  sellingPoints: ['双人可用', '含牛五花、鸡翅、蔬菜拼盘'],
  fallbackPackageId: 'PKG002',
  miniProgramPath: '/pages/package/detail?id=PKG001',
  saleStatus: 'selling',
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

const request: GenerateCopyRequest = {
  packageId: 'PKG001',
  channel: 'wechat_group',
  scenario: '库存冲刺',
  tone: '真实群主口吻',
  copyCount: 2,
  createdBy: 'tester',
  useAI: true
};

const detail: PackageDetail = {
  packageId: 'PKG001',
  packageTitle: '双人烤肉套餐详情',
  sections: [
    {
      title: '主菜2选1',
      selectionRule: '2选1',
      items: [
        { name: '招牌牛五花', quantity: '1份' },
        { name: '黑椒鸡翅', quantity: '1份' }
      ]
    }
  ],
  fetchedAt: new Date('2026-05-14T10:00:00.000Z')
};

describe('AICopyService', () => {
  beforeEach(() => {
    openAiMocks.create.mockReset();
  });

  it('reports the compatible AI endpoint status without hiding missing config', () => {
    const service = new AICopyService(new ConfigService({}));

    expect(service.getStatus()).toEqual({
      enabled: false,
      providerName: 'DeepSeek',
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      missing: ['AI_API_KEY'],
      maskedApiKey: null,
      temperature: 0.7,
      maxTokens: 900
    });
  });

  it('updates runtime AI config and only exposes a masked API key', () => {
    const service = new AICopyService(new ConfigService({}));

    const status = service.updateConfig({
      apiKey: 'sk-1234567890abcdef',
      baseURL: 'https://api.example.com/v1',
      model: 'custom-copy-model',
      providerName: '前台配置AI',
      temperature: 0.4,
      maxTokens: 1200
    });

    expect(status).toEqual({
      enabled: true,
      providerName: '前台配置AI',
      baseURL: 'https://api.example.com/v1',
      model: 'custom-copy-model',
      missing: [],
      maskedApiKey: 'sk-1**********cdef',
      temperature: 0.4,
      maxTokens: 1200
    });
    expect(JSON.stringify(status)).not.toContain('sk-1234567890abcdef');
    expect(service.getStatus().maskedApiKey).toBe('sk-1**********cdef');
  });

  it('sends package facts and parsed package detail to the AI endpoint', async () => {
    openAiMocks.create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              copies: [
                {
                  title: '宝安烤肉双人餐',
                  body: '老张炭火烤肉双人套餐，福利价19.9元，剩余18份。需提前2小时预约，周末可用。',
                  cta: '去下单'
                },
                {
                  title: '今晚烤肉安排',
                  body: '宝安中心老张炭火烤肉，招牌牛五花和黑椒鸡翅可选，当前售价39.9元。',
                  cta: '立即看看'
                }
              ]
            })
          }
        }
      ]
    });

    const service = new AICopyService(
      new ConfigService({
        AI_API_KEY: 'test-key',
        AI_API_BASE_URL: 'https://example.test/v1',
        AI_MODEL: 'copy-model',
        AI_PROVIDER_NAME: '测试AI'
      })
    );

    const copies = await service.generateCopies(pkg, promotion, request, detail);

    expect(openAiMocks.create.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        model: 'copy-model',
        temperature: 0.7,
        max_tokens: 900
      })
    );
    const prompt = openAiMocks.create.mock.calls[0][0].messages[1].content as string;
    expect(prompt).toContain('当前售价：39.9元');
    expect(prompt).toContain('价格口径：只允许使用“当前售价”');
    expect(prompt).not.toContain('福利价：19.9元');
    expect(prompt).toContain('当前剩余库存：18份');
    expect(prompt).toContain('需提前2小时预约、周末可用');
    expect(prompt).toContain('主菜2选1（2选1）：招牌牛五花 1份、黑椒鸡翅 1份');
    expect(copies).toHaveLength(2);
    expect(copies[0]).toMatchObject({
      title: '宝安烤肉双人餐',
      body: expect.stringContaining('39.9'),
      channel: 'wechat_group',
      scenario: '库存冲刺',
      auditStatus: 'pending',
      createdBy: 'tester'
    });
  });

  it('builds an operator-style brief instead of a generic fact checklist', async () => {
    openAiMocks.create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              copies: [
                {
                  title: '宝安烤肉今晚可用',
                  body: '群里有人问晚餐，这个老张炭火烤肉双人餐还剩18份，福利价19.9元。牛五花/鸡翅二选一，记得提前2小时预约。',
                  cta: '戳链接下单'
                }
              ]
            })
          }
        }
      ]
    });

    const service = new AICopyService(new ConfigService({ AI_API_KEY: 'test-key' }));
    await service.generateCopies(pkg, promotion, { ...request, copyCount: 1 }, detail);

    const prompt = openAiMocks.create.mock.calls[0][0].messages[1].content as string;
    expect(prompt).toContain('像真实运营在群里发');
    expect(prompt).toContain('不要写官方广告腔');
    expect(prompt).toContain('差文案禁区');
    expect(prompt).toContain('每条文案必须有不同切入点');
    expect(prompt).toContain('先给购买理由，再给价格/库存，再给套餐亮点');
    expect(prompt).toContain('禁止空话：品质好、性价比高、不容错过、心动不如行动');
  });

  it('uses a daily operator default when no copy scenario is provided', async () => {
    openAiMocks.create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              copies: [
                {
                  title: '宝安烤肉今晚可用',
                  body: '老张炭火烤肉双人餐还剩18份，福利价19.9元。牛五花和黑椒鸡翅二选一，需提前2小时预约。',
                  cta: '戳链接下单'
                }
              ]
            })
          }
        }
      ]
    });

    const service = new AICopyService(new ConfigService({ AI_API_KEY: 'test-key' }));
    const requestWithoutScenario = { ...request };
    delete requestWithoutScenario.scenario;
    const [copy] = await service.generateCopies(
      pkg,
      promotion,
      { ...requestWithoutScenario, copyCount: 1 },
      detail
    );

    const prompt = openAiMocks.create.mock.calls[0][0].messages[1].content as string;
    expect(prompt).toContain('场景：日常运营推荐');
    expect(prompt).toContain('日常运营目标');
    expect(prompt).not.toContain('undefined');
    expect(copy.scenario).toBe('日常运营推荐');
  });

  it('replaces malformed AI titles that treat brand names as food or keep package numbers', async () => {
    openAiMocks.create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              copies: [
                {
                  title: '今晚想吃绿茶？双人餐1',
                  body: '群里有人问晚餐，绿茶餐厅双人餐还剩18份，福利价19.9元。招牌牛五花和黑椒鸡翅二选一，需提前2小时预约。',
                  cta: '戳链接下单'
                }
              ]
            })
          }
        }
      ]
    });

    const greenTeaPkg: ContentPackage = {
      ...pkg,
      packageName: '绿茶餐厅｜双人餐1',
      merchantName: '绿茶餐厅',
      sellingPoints: ['双人餐', '下班晚餐可用']
    };
    const service = new AICopyService(new ConfigService({ AI_API_KEY: 'test-key' }));
    const [copy] = await service.generateCopies(
      greenTeaPkg,
      promotion,
      { ...request, copyCount: 1 },
      detail
    );

    expect(copy.title).not.toContain('想吃绿茶');
    expect(copy.title).not.toContain('双人餐1');
    expect(copy.title).toBe('今晚双人餐可用');
  });
});
