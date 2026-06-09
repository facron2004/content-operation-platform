import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ContentPackage, GeneratedCopy, GenerateCopyRequest, PromotionScore, StrategyType } from '@content/shared';
import OpenAI from 'openai';
import { auditCopyText } from '../domain/copy-rules';
import type { PackageDetail } from './package-detail.service';

interface AICopyDraft {
  title: string;
  body: string;
  cta?: string;
}

export interface AICopyStatus {
  enabled: boolean;
  providerName: string;
  baseURL: string;
  model: string;
  missing: string[];
  maskedApiKey: string | null;
  temperature: number;
  maxTokens: number;
}

export interface AICopyConfigUpdate {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  providerName?: string;
  temperature?: number;
  maxTokens?: number;
}

const versionLetters = ['A', 'B', 'C', 'D', 'E'];
const defaultScenario = '日常运营推荐';
const currentPackagePrice = (pkg: ContentPackage) => pkg.temporarySalePrice ?? pkg.salePrice;

@Injectable()
export class AICopyService {
  private readonly logger = new Logger(AICopyService.name);
  private client: OpenAI | null = null;
  private status: AICopyStatus;
  private apiKey: string | null = null;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.status = this.applyConfig({
      apiKey: this.config.get<string>('AI_API_KEY') ?? this.config.get<string>('DEEPSEEK_API_KEY'),
      baseURL: this.config.get<string>('AI_API_BASE_URL'),
      model: this.config.get<string>('AI_MODEL'),
      providerName: this.config.get<string>('AI_PROVIDER_NAME'),
      temperature: this.parseNumber(this.config.get<string>('AI_TEMPERATURE'), 0.7),
      maxTokens: this.parseNumber(this.config.get<string>('AI_MAX_TOKENS'), 900)
    });

    if (!this.client) {
      this.logger.warn('AI copy generation disabled: AI_API_KEY is not configured');
    }
  }

  getStatus(): AICopyStatus {
    return this.status;
  }

  updateConfig(update: AICopyConfigUpdate): AICopyStatus {
    this.status = this.applyConfig({
      apiKey: this.normalizeText(update.apiKey) ?? this.apiKey ?? undefined,
      baseURL: this.normalizeText(update.baseURL) ?? this.status.baseURL,
      model: this.normalizeText(update.model) ?? this.status.model,
      providerName: this.normalizeText(update.providerName) ?? this.status.providerName,
      temperature: this.parseNumber(update.temperature, this.status.temperature),
      maxTokens: Math.round(this.parseNumber(update.maxTokens, this.status.maxTokens))
    });
    return this.status;
  }

  async generateCopies(
    pkg: ContentPackage,
    promotion: PromotionScore,
    request: GenerateCopyRequest,
    packageDetail: PackageDetail | null
  ): Promise<GeneratedCopy[]> {
    if (!this.client) {
      throw new ServiceUnavailableException('AI文案接口未配置：请先配置 AI_API_KEY、AI_API_BASE_URL 和 AI_MODEL');
    }

    const count = Math.max(1, Math.min(request.copyCount || 3, 5));
    const prompt = this.buildPrompt(pkg, promotion, request, packageDetail, count);

    // 超时控制：通过 AbortController 防止 AI 调用长时间阻塞
    const timeoutMs = parseInt(process.env.AI_GENERATE_TIMEOUT_MS ?? '30000', 10);
    const MAX_RETRIES = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await this.client.chat.completions.create(
          {
            model: this.status.model,
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
            temperature: this.status.temperature,
            max_tokens: this.status.maxTokens
          },
          { signal: controller.signal }
        );

        clearTimeout(timeoutId);
        const content = response.choices[0]?.message?.content ?? '';
        const drafts = this.parseDrafts(content, count);
        return this.toGeneratedCopies(pkg, promotion, request, drafts, packageDetail, count);
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        const err = error instanceof Error ? error : new Error(String(error));

        // AbortError = timeout → 不重试
        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
          this.logger.warn(`AI copy generation timed out after ${timeoutMs}ms for package ${pkg.packageId}`);
          throw new ServiceUnavailableException(
            `AI文案生成超时（${Math.round(timeoutMs / 1000)}s），请稍后重试或减少生成数量`
          );
        }

        lastError = err;

        // 仅对 5xx 或网络错误重试
        const statusCode = (error as { status?: number })?.status;
        const isRetryable = !statusCode || statusCode >= 500;
        if (attempt < MAX_RETRIES && isRetryable) {
          const delayMs = 1000 * Math.pow(2, attempt);
          this.logger.warn(`AI copy attempt ${attempt + 1} failed (${err.message}), retrying in ${delayMs}ms...`);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        throw err;
      }
    }

    // 理论上不会到达，但 TS 需要返回值
    throw lastError ?? new ServiceUnavailableException('AI文案生成失败，请稍后重试');
  }

  private buildPrompt(
    pkg: ContentPackage,
    promotion: PromotionScore,
    request: GenerateCopyRequest,
    packageDetail: PackageDetail | null,
    count: number
  ) {
    const scenario = this.resolveScenario(request.scenario);
    const currentPrice = currentPackagePrice(pkg);
    const priceLines = [
      `原价：${pkg.originalPrice}元`,
      currentPrice ? `当前售价：${currentPrice}元` : null,
    ].filter(Boolean);

    return [
      `请生成 ${count} 条可直接给运营使用的本地生活套餐文案。像真实运营在群里发，不要写官方广告腔。`,
      '',
      '【套餐事实】',
      `套餐ID：${pkg.packageId}`,
      `套餐名称：${pkg.packageName}`,
      `商家：${pkg.merchantName}`,
      `区域：${pkg.areaName}`,
      `类型：${pkg.category}`,
      ...priceLines,
      '价格口径：只允许使用“当前售价”。当前售价已按 JeeSite 一口价优先、否则临时售价解析，其他价格字段不要当成交价写。',
      `当前剩余库存：${pkg.stockLeft}份`,
      `总库存：${pkg.stockTotal}份`,
      `销售状态：${pkg.saleStatus ?? '未知'}`,
      `卖点：${pkg.sellingPoints.join('、') || '无'}`,
      `使用规则：${pkg.useRules.join('、') || '无'}`,
      pkg.detailSummary ? `详情摘要：${pkg.detailSummary}` : null,
      '',
      '【套餐明细】',
      this.formatPackageDetail(packageDetail),
      '',
      '【运营策略】',
      `渠道：${this.channelLabel(request.channel)}`,
      `场景：${scenario}`,
      `语气：${request.tone || '自然、真实、像群主在提醒'}`,
      `推荐策略：${promotion.recommendedStrategy}`,
      `推荐原因：${promotion.reason}`,
      `风险提示：${promotion.riskTips.join('、') || '无'}`,
      request.extraInstruction ? `补充要求：${request.extraInstruction}` : null,
      '',
      '【写作 brief】',
      this.channelWritingGuide(request.channel),
      this.scenarioWritingGoal(scenario),
      '每条文案必须有不同切入点：价格差、套餐内容、附近可用、库存提醒、多人/多店适用，不能只是换几个形容词。',
      '先给购买理由，再给价格/库存，再给套餐亮点，最后提醒使用规则和下单动作。',
      '套餐明细不要流水账全列，优先挑 2-4 个最有画面感、最能促成下单的项目。',
      '标题要像运营自己会发的短句，不要复读完整套餐名，不要写成平台广告标题。',
      '',
      '【差文案禁区】',
      '禁止空话：品质好、性价比高、不容错过、心动不如行动、优惠力度大、吃货必备、赶快冲。',
      '不要写官方广告腔，不要写“尊敬的用户”“本套餐包含如下内容”“欢迎选购”。',
      '不要写“今晚想吃绿茶/想吃品牌名”这种标题；品牌名是商家名，不等于用户想吃的菜品。',
      '不要把套餐编号或版本号放进标题，例如“双人餐1”“套餐1”“版本A”。',
      '不要堆叠感叹号和夸张词，不要出现没依据的口味评价或排行榜。',
      '',
      '【优秀示例风格】',
      '标题：今晚想吃烤肉的看这条',
      `正文示例结构：群里刚有人问晚餐，这个双人餐还剩${pkg.stockLeft}份。\\n￥${currentPrice}，挑2个最有画面感的套餐明细，适合两个人下班直接去。\\n补一句关键使用规则。`,
      'cta：戳链接下单',
      '',
      '【输出要求】',
      '1. 只输出 JSON，不要解释，不要 Markdown。',
      '2. JSON 格式：{"copies":[{"title":"...","body":"...","cta":"..."}]}。',
      '3. title 不超过 22 个中文字符，body 控制在 80-180 个中文字符，最多 4 行。',
      '4. 必须保留准确价格、库存、关键套餐明细和关键使用规则；没有提供的信息不要编造。',
      '5. 禁止使用全网最低、最后疯抢、错过后悔、稳赚、保证返利等绝对化表述。'
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  }

  private formatPackageDetail(detail: PackageDetail | null) {
    if (!detail || detail.sections.length === 0) {
      return '未抓取到套餐明细，请仅使用套餐事实、卖点和使用规则生成。';
    }

    return detail.sections
      .map((section) => {
        const rule = section.selectionRule ? `（${section.selectionRule}）` : '';
        const items = section.items.map((item) => `${item.name} ${item.quantity}`.trim()).join('、');
        return `${section.title}${rule}：${items || '无明细'}`;
      })
      .join('\n');
  }

  private parseDrafts(content: string, count: number): AICopyDraft[] {
    const normalized = content.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    try {
      const parsed = JSON.parse(normalized);
      const copies = Array.isArray(parsed) ? parsed : parsed.copies;
      if (Array.isArray(copies)) {
        const drafts = copies
          .map((item) => ({
            title: String(item?.title ?? '').trim(),
            body: String(item?.body ?? '').trim(),
            cta: String(item?.cta ?? '').trim()
          }))
          .filter((item) => item.title && item.body);
        if (drafts.length > 0) return drafts.slice(0, count);
      }
    } catch (error) {
      this.logger.warn('AI copy response is not valid JSON, falling back to text parsing');
    }

    const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      throw new ServiceUnavailableException('AI文案接口未返回有效内容，请稍后重试');
    }

    return [
      {
        title: lines[0].replace(/^标题[：:]/, '').slice(0, 32),
        body: lines.slice(1).join('\n').replace(/^正文[：:]/, '').slice(0, 320),
        cta: '立即下单'
      }
    ];
  }

  private toGeneratedCopies(
    pkg: ContentPackage,
    promotion: PromotionScore,
    request: GenerateCopyRequest,
    drafts: AICopyDraft[],
    packageDetail: PackageDetail | null,
    count: number
  ): GeneratedCopy[] {
    const now = new Date().toISOString();
    const completedDrafts = this.completeDrafts(pkg, request, drafts, packageDetail, count);
    return completedDrafts.slice(0, count).map((draft, index) => {
      const strategyType = promotion.recommendedStrategy as StrategyType;
      const polishedDraft = this.polishDraft(pkg, request, draft, packageDetail);
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
        scenario: this.resolveScenario(request.scenario),
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

  private channelLabel(channel: GenerateCopyRequest['channel']) {
    const labels: Record<GenerateCopyRequest['channel'], string> = {
      wechat_group: '微信群',
      moments: '朋友圈',
      merchant_share: '商家转发'
    };
    return labels[channel];
  }

  private channelWritingGuide(channel: GenerateCopyRequest['channel']) {
    const guides: Record<GenerateCopyRequest['channel'], string> = {
      wechat_group: '微信群写法：像群主/运营顺手提醒，短句、分行、少修饰；开头要有具体场景，例如“今晚想吃”“附近上班的”“带娃/双人”。',
      moments: '朋友圈写法：更像个人种草，画面感强一点，可以有轻微情绪，但不要硬广；适合突出“今天去哪吃/周末安排”。',
      merchant_share: '商家转发写法：更稳重，突出门店、套餐内容、使用规则和下单动作，避免太口语化。'
    };
    return guides[channel];
  }

  private scenarioWritingGoal(scenario?: string) {
    const resolvedScenario = this.resolveScenario(scenario);
    if (resolvedScenario === defaultScenario) {
      return '日常运营目标：不靠预设场景，按套餐事实、渠道和真实购买理由写出运营能直接发的文案。';
    }
    if (resolvedScenario.includes('库存')) return '库存冲刺目标：库存要自然露出，用“还剩X份/今天还能下单”提醒，不要制造恐慌。';
    if (resolvedScenario.includes('预告')) return '社群预告目标：先制造期待，再交代价格和可用场景，不要像活动公告。';
    if (resolvedScenario.includes('开抢')) return '开抢提醒目标：开头直接告诉现在能买，重点是价格、库存和谁适合买。';
    if (resolvedScenario.includes('售罄')) return '售罄承接目标：如果已售罄，不能写还能抢；引导关注替代套餐或下次补货。';
    if (resolvedScenario.includes('转化')) return '转化优化目标：补足购买理由，解释为什么现在值得买，不要只喊优惠。';
    return `场景目标：围绕“${resolvedScenario}”写出明确购买理由和下一步动作。`;
  }

  private resolveProviderName(baseURL: string) {
    return baseURL.includes('deepseek') ? 'DeepSeek' : 'OpenAI-compatible';
  }

  private applyConfig(config: AICopyConfigUpdate): AICopyStatus {
    const apiKey = this.normalizeText(config.apiKey) ?? null;
    const baseURL = this.normalizeText(config.baseURL) ?? 'https://api.deepseek.com';
    const model = this.normalizeText(config.model) ?? 'deepseek-chat';
    const providerName = this.normalizeText(config.providerName) ?? this.resolveProviderName(baseURL);
    const temperature = this.parseNumber(config.temperature, 0.7);
    const maxTokens = Math.round(this.parseNumber(config.maxTokens, 900));
    const missing = apiKey ? [] : ['AI_API_KEY'];

    this.apiKey = apiKey;
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          baseURL
        })
      : null;

    return {
      enabled: missing.length === 0,
      providerName,
      baseURL,
      model,
      missing,
      maskedApiKey: this.maskApiKey(apiKey),
      temperature,
      maxTokens
    };
  }

  private completeDrafts(
    pkg: ContentPackage,
    request: GenerateCopyRequest,
    drafts: AICopyDraft[],
    packageDetail: PackageDetail | null,
    count: number
  ) {
    const completed = [...drafts];
    const fallbackDrafts = this.buildFallbackDrafts(pkg, request, packageDetail, count);
    for (const fallback of fallbackDrafts) {
      if (completed.length >= count) break;
      completed.push(fallback);
    }
    return completed;
  }

  private polishDraft(
    pkg: ContentPackage,
    request: GenerateCopyRequest,
    draft: AICopyDraft,
    packageDetail: PackageDetail | null
  ): AICopyDraft {
    const title = this.cleanGeneratedText(draft.title);
    const body = this.cleanGeneratedText(draft.body);
    const cta = this.cleanGeneratedText(draft.cta ?? '') || '立即下单';

    return {
      title: this.shouldReplaceTitle(title, pkg) ? this.buildSafeTitle(pkg, request) : title,
      body: this.shouldReplaceBody(body, pkg, packageDetail) ? this.buildSafeBody(pkg, request, packageDetail) : this.stripBadPhrases(body),
      cta
    };
  }

  private shouldReplaceTitle(title: string, pkg: ContentPackage) {
    if (!title || title.length < 4) return true;
    if (this.hasJsonLeak(title)) return true;
    if (/(?:套餐|双人餐|单人餐|多人餐)\s*[A-Za-z0-9]$/.test(title)) return true;
    if (/版本[A-Z]$/.test(title)) return true;
    if (this.treatsBrandAsFood(title, pkg)) return true;
    return false;
  }

  private shouldReplaceBody(body: string, pkg: ContentPackage, packageDetail: PackageDetail | null) {
    if (!body || body.length < 30) return true;
    if (this.hasJsonLeak(body)) return true;
    if (this.looksGenericBody(body)) return true;
    if (!this.containsCurrentPrice(body, pkg)) return true;
    if (this.mentionsWrongPrice(body, pkg)) return true;
    if (pkg.stockLeft > 0 && !body.includes(String(pkg.stockLeft))) return true;
    const detailHighlights = this.detailHighlights(packageDetail, pkg);
    if (detailHighlights.length && !detailHighlights.some((item) => body.includes(item))) return true;
    const rule = this.primaryUseRule(pkg);
    if (rule && !body.includes(rule)) return true;
    return false;
  }

  private buildFallbackDrafts(
    pkg: ContentPackage,
    request: GenerateCopyRequest,
    packageDetail: PackageDetail | null,
    count: number
  ): AICopyDraft[] {
    const noun = this.inferPackageNoun(pkg);
    const price = currentPackagePrice(pkg);
    const titles = [
      this.buildSafeTitle(pkg, request),
      `${this.shortArea(pkg.areaName)}${noun}看这条`,
      `${noun}${price}元能下单`,
      pkg.stockLeft > 0 ? `${noun}还剩${pkg.stockLeft}份` : `${noun}等补货`,
      `${noun}适合今天推`
    ];

    return titles.slice(0, count).map((title) => ({
      title,
      body: this.buildSafeBody(pkg, request, packageDetail),
      cta: pkg.miniProgramPath ? '戳链接下单' : '去下单'
    }));
  }

  private buildSafeBody(pkg: ContentPackage, request: GenerateCopyRequest, packageDetail: PackageDetail | null) {
    const price = currentPackagePrice(pkg);
    const noun = this.inferPackageNoun(pkg);
    const details = this.detailHighlights(packageDetail, pkg).slice(0, 4).join('、') || noun;
    const rule = this.primaryUseRule(pkg);
    const opening = this.channelOpening(request.channel, noun);
    const stockLine = pkg.stockLeft > 0
      ? `当前还剩${pkg.stockLeft}份`
      : '当前已售罄，适合做承接或等补货提醒';
    const ruleLine = rule ? `记得看规则：${rule}` : '下单前看好门店和可用时间';
    return [
      `${opening}，${this.shortMerchant(pkg.merchantName)}这个${noun}可以推。`,
      `￥${price}，${details}。`,
      `${stockLine}，${ruleLine}。`
    ].join('\n');
  }

  private detailHighlights(packageDetail: PackageDetail | null, pkg: ContentPackage) {
    const detailItems = packageDetail?.sections
      ?.flatMap((section) => section.items.map((item) => item.name.trim()).filter(Boolean))
      .filter((item) => item.length <= 18) ?? [];
    const sellingPoints = pkg.sellingPoints.map((point) => point.trim()).filter(Boolean);
    return [...new Set([...detailItems, ...sellingPoints])];
  }

  private primaryUseRule(pkg: ContentPackage) {
    return pkg.useRules.find((rule) => rule.trim().length > 0 && rule.trim().length <= 36)?.trim() ?? '';
  }

  private containsCurrentPrice(text: string, pkg: ContentPackage) {
    const price = currentPackagePrice(pkg);
    return text.includes(String(price));
  }

  private mentionsWrongPrice(text: string, pkg: ContentPackage) {
    const currentPrice = currentPackagePrice(pkg);
    const wrongPrices = [pkg.welfarePrice, pkg.salePrice, pkg.temporarySalePrice]
      .filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0 && price !== currentPrice);
    return wrongPrices.some((price) => new RegExp(`(?:￥|¥|价|元|\\b)${this.escapeRegExp(String(price))}(?:元|\\b)`).test(text));
  }

  private looksGenericBody(body: string) {
    return /品质好|性价比高|不容错过|心动不如行动|优惠力度大|吃货必备|赶快冲|尊敬的用户|欢迎选购/.test(body);
  }

  private stripBadPhrases(body: string) {
    return body
      .replace(/品质好|性价比高|不容错过|心动不如行动|优惠力度大|吃货必备|赶快冲/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private channelOpening(channel: GenerateCopyRequest['channel'], noun: string) {
    const openings: Record<GenerateCopyRequest['channel'], string> = {
      wechat_group: `群里问${noun}的可以看这条`,
      moments: `今天想安排${noun}的话可以看看`,
      merchant_share: `门店这份${noun}现在可下单`
    };
    return openings[channel];
  }

  private shortMerchant(merchantName: string) {
    return merchantName.split(',')[0].replace(/（.*?）/g, '').trim() || merchantName;
  }

  private shortArea(areaName: string) {
    return areaName.length > 6 ? areaName.slice(0, 6) : areaName;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private treatsBrandAsFood(title: string, pkg: ContentPackage) {
    const brand = this.extractAmbiguousBrand(pkg.merchantName);
    if (!brand) return false;
    return title.includes(`想吃${brand}`) || title.includes(`吃${brand}？`) || title.includes(`吃${brand}?`);
  }

  private extractAmbiguousBrand(merchantName: string) {
    const shortName = merchantName.split(',')[0].replace(/（.*?）/g, '').trim();
    const normalized = shortName.replace(/餐厅|饭店|酒楼|门店|小吃|烧烤|烤肉|火锅|料理|茶饮|甜品/g, '');
    const ambiguousFoodWords = ['绿茶', '茶', '牛肉', '烤肉', '火锅', '烧烤', '鱼', '鸡', '鸭', '饭', '面', '粉'];
    return ambiguousFoodWords.includes(normalized) ? normalized : '';
  }

  private buildSafeTitle(pkg: ContentPackage, request: GenerateCopyRequest) {
    const noun = this.inferPackageNoun(pkg);
    const scenario = this.resolveScenario(request.scenario);
    if (scenario.includes('库存')) return `今晚${noun}可用`;
    if (scenario.includes('开抢')) return `${noun}现在可下单`;
    if (scenario.includes('预告')) return `${noun}先看这条`;
    if (scenario.includes('转化')) return `${noun}值得看一眼`;
    return `今晚${noun}可用`;
  }

  private resolveScenario(scenario?: string) {
    return this.normalizeText(scenario) ?? defaultScenario;
  }

  private inferPackageNoun(pkg: ContentPackage) {
    const name = pkg.packageName.replace(/[|｜]/g, ' ').replace(/\d+$/g, '');
    if (name.includes('双人')) return '双人餐';
    if (name.includes('单人')) return '单人餐';
    if (name.includes('多人')) return '多人餐';
    if (name.includes('烤肉')) return '烤肉';
    if (name.includes('火锅')) return '火锅';
    if (name.includes('下午茶')) return '下午茶';
    if (name.includes('亲子')) return '亲子套餐';
    if (pkg.category && pkg.category !== '餐饮') return pkg.category;
    return '这份套餐';
  }

  private cleanGeneratedText(value: string) {
    return value
      .replace(/^["'“”]+|["'“”]+$/g, '')
      .replace(/^(标题|正文|cta|CTA)[：:]\s*/, '')
      .trim();
  }

  private hasJsonLeak(value: string) {
    return /[{}`]|\b(copies|title|body|cta)\b/i.test(value);
  }

  private maskApiKey(apiKey: string | null) {
    if (!apiKey) return null;
    if (apiKey.length <= 8) return '****';
    return `${apiKey.slice(0, 4)}**********${apiKey.slice(-4)}`;
  }

  private normalizeText(value: string | undefined | null) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || undefined;
  }

  private parseNumber(value: string | number | undefined, fallback: number) {
    const parsed = value === undefined ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
