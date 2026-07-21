import type { ContentPackage, GenerateCopyRequest, PromotionScore } from '@content/shared';
import { currentPrice, DEFAULT_SCENARIO } from '@content/shared';
import type { PackageDetail } from '../package-detail';

export class PromptBuilder {
  buildPrompt(
    pkg: ContentPackage,
    promotion: PromotionScore,
    request: GenerateCopyRequest,
    packageDetail: PackageDetail | null,
    count: number
  ): string {
    const scenario = this.resolveScenario(request.scenario);
    const price = currentPrice(pkg);
    const priceLines = [
      `原价：${pkg.originalPrice}元`,
      price ? `当前售价：${price}元` : null
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
      '价格口径：只允许使用\u201c当前售价\u201d。当前售价已按 JeeSite 一口价优先、否则临时售价解析，其他价格字段不要当成交价写。',
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
      '不要写官方广告腔，不要写"尊敬的用户""本套餐包含如下内容""欢迎选购"。',
      '不要写"今晚想吃绿茶/想吃品牌名"这种标题；品牌名是商家名，不等于用户想吃的菜品。',
      '不要把套餐编号或版本号放进标题，例如"双人餐1""套餐1""版本A"。',
      '不要堆叠感叹号和夸张词，不要出现没依据的口味评价或排行榜。',
      '',
      '【优秀示例风格】',
      '标题：今晚想吃烤肉的看这条',
      `正文示例结构：群里刚有人问晚餐，这个双人餐还剩${pkg.stockLeft}份。\\n￥${price ?? '—'}，挑2个最有画面感的套餐明细，适合两个人下班直接去。\\n补一句关键使用规则。`,
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

  private formatPackageDetail(detail: PackageDetail | null): string {
    if (!detail || detail.sections.length === 0) {
      return '未抓取到套餐明细，请仅使用套餐事实、卖点和使用规则生成。';
    }

    return detail.sections
      .map((section) => {
        const rule = section.selectionRule ? `（${section.selectionRule}）` : '';
        const items = section.items
          .map((item) => `${item.name} ${item.quantity}`.trim())
          .join('、');
        return `${section.title}${rule}：${items || '无明细'}`;
      })
      .join('\n');
  }

  private channelLabel(channel: GenerateCopyRequest['channel']): string {
    const labels: Record<GenerateCopyRequest['channel'], string> = {
      wechat_group: '微信群',
      moments: '朋友圈',
      merchant_share: '商家转发'
    };
    return labels[channel];
  }

  private channelWritingGuide(channel: GenerateCopyRequest['channel']): string {
    const guides: Record<GenerateCopyRequest['channel'], string> = {
      wechat_group:
        '微信群写法：像群主/运营顺手提醒，短句、分行、少修饰；开头要有具体场景，例如"今晚想吃""附近上班的""带娃/双人"。',
      moments:
        '朋友圈写法：更像个人种草，画面感强一点，可以有轻微情绪，但不要硬广；适合突出"今天去哪吃/周末安排"。',
      merchant_share: '商家转发写法：更稳重，突出门店、套餐内容、使用规则和下单动作，避免太口语化。'
    };
    return guides[channel];
  }

  private scenarioWritingGoal(scenario: string): string {
    if (scenario === DEFAULT_SCENARIO) {
      return '日常运营目标：不靠预设场景，按套餐事实、渠道和真实购买理由写出运营能直接发的文案。';
    }
    if (scenario.includes('库存'))
      return '库存冲刺目标：库存要自然露出，用"还剩X份/今天还能下单"提醒，不要制造恐慌。';
    if (scenario.includes('预告'))
      return '社群预告目标：先制造期待，再交代价格和可用场景，不要像活动公告。';
    if (scenario.includes('开抢'))
      return '开抢提醒目标：开头直接告诉现在能买，重点是价格、库存和谁适合买。';
    if (scenario.includes('售罄'))
      return '售罄承接目标：如果已售罄，不能写还能抢；引导关注替代套餐或下次补货。';
    if (scenario.includes('转化'))
      return '转化优化目标：补足购买理由，解释为什么现在值得买，不要只喊优惠。';
    return `场景目标：围绕"${scenario}"写出明确购买理由和下一步动作。`;
  }

  private resolveScenario(scenario?: string): string {
    return scenario?.trim() || DEFAULT_SCENARIO;
  }
}
