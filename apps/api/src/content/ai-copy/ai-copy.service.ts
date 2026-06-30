import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ContentPackage,
  GeneratedCopy,
  GenerateCopyRequest,
  PromotionScore,
  StrategyType
} from '@content/shared';
import { auditCopyText } from '../../domain/copy-rules';
import type { PackageDetail } from '../package-detail.service';
import { AIClientManager } from './ai-client.manager';
import { PromptBuilder } from './prompt.builder';
import { ResponseParser } from './response.parser';
import { RetryHandler } from './retry.handler';
import { CopyGenerator } from './copy.generator';
import type { AICopyStatus, AICopyConfigUpdate } from './types';

const versionLetters = ['A', 'B', 'C', 'D', 'E'];

@Injectable()
export class AICopyService {
  private readonly clientManager: AIClientManager;
  private readonly promptBuilder = new PromptBuilder();
  private readonly responseParser = new ResponseParser();
  private readonly retryHandler: RetryHandler;
  private readonly copyGenerator: CopyGenerator;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.clientManager = new AIClientManager({
      apiKey: this.config.get<string>('AI_API_KEY') ?? this.config.get<string>('DEEPSEEK_API_KEY'),
      baseURL: this.config.get<string>('AI_API_BASE_URL'),
      model: this.config.get<string>('AI_MODEL'),
      providerName: this.config.get<string>('AI_PROVIDER_NAME'),
      temperature: this.parseNumber(this.config.get<string>('AI_TEMPERATURE'), 0.7),
      maxTokens: this.parseNumber(this.config.get<string>('AI_MAX_TOKENS'), 900)
    });

    this.retryHandler = new RetryHandler();
    this.copyGenerator = new CopyGenerator();
  }

  getStatus(): AICopyStatus {
    return this.clientManager.getStatus();
  }

  updateConfig(update: AICopyConfigUpdate): AICopyStatus {
    return this.clientManager.updateConfig(update);
  }

  async generateCopies(
    pkg: ContentPackage,
    promotion: PromotionScore,
    request: GenerateCopyRequest,
    packageDetail: PackageDetail | null
  ): Promise<GeneratedCopy[]> {
    const client = this.clientManager.getClient();
    if (!client) {
      throw new ServiceUnavailableException(
        'AI文案接口未配置：请先配置 AI_API_KEY、AI_API_BASE_URL 和 AI_MODEL'
      );
    }

    const count = Math.max(1, Math.min(request.copyCount || 3, 5));
    const prompt = this.promptBuilder.buildPrompt(pkg, promotion, request, packageDetail, count);
    const status = this.clientManager.getStatus();

    const content = await this.retryHandler.executeWithRetry(async (controller) => {
      const response = await client.chat.completions.create(
        {
          model: status.model,
          messages: [
            {
              role: 'system',
              content: [
                '你是本地生活运营中台的资深内容运营，不是普通广告文案助手。',
                '你的目标是写出运营能直接发到社群/朋友圈/商家群的短文案：真实、有购买理由、有套餐画面感。',
                '你必须只基于用户提供的套餐事实写文案，不能编造价格、库存、门店、菜品或使用规则。'
              ].join('\n')
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: status.temperature,
          max_tokens: status.maxTokens
        },
        { signal: controller.signal }
      );

      return response.choices[0]?.message?.content ?? '';
    }, pkg.packageId);

    const drafts = this.responseParser.parseDrafts(content, count);
    return this.toGeneratedCopies(pkg, promotion, request, drafts, packageDetail, count);
  }

  private toGeneratedCopies(
    pkg: ContentPackage,
    promotion: PromotionScore,
    request: GenerateCopyRequest,
    drafts: Array<{ title: string; body: string; cta?: string }>,
    packageDetail: PackageDetail | null,
    count: number
  ): GeneratedCopy[] {
    const now = new Date().toISOString();
    const completedDrafts = this.copyGenerator.completeDrafts(
      pkg,
      request,
      drafts,
      packageDetail,
      count
    );

    return completedDrafts.slice(0, count).map((draft, index) => {
      const strategyType = promotion.recommendedStrategy as StrategyType;
      const polishedDraft = this.copyGenerator.polishDraft(pkg, request, draft, packageDetail);
      const audit = auditCopyText(pkg, {
        title: polishedDraft.title,
        body: polishedDraft.body,
        strategyType
      });

      return {
        contentId: `AI${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
        packageId: pkg.packageId,
        areaId: pkg.areaId,
        merchantId: pkg.merchantId,
        channel: request.channel,
        scenario: request.scenario?.trim() || '日常运营推荐',
        title: polishedDraft.title.slice(0, 48),
        body: polishedDraft.body.slice(0, 360),
        cta: polishedDraft.cta || '立即下单',
        copyVersion: versionLetters[index] ?? `${index + 1}`,
        strategyType,
        riskLevel: audit.riskLevel,
        riskTips: [...promotion.riskTips, ...audit.riskTips],
        auditStatus: audit.auditStatus === 'risk' ? 'risk' : 'pending',
        auditRemark: audit.riskTips.join('；') || null,
        createdBy: request.createdBy ?? 'ai',
        createdAt: now,
        updatedAt: now
      };
    });
  }

  private parseNumber(value: string | number | undefined, fallback: number): number {
    const parsed = value === undefined ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
