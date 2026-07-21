import type { ContentPackage, GenerateCopyRequest } from '@content/shared';
import { currentPrice } from '@content/shared';
import type { PackageDetail } from '../package-detail';
import type { AICopyDraft } from './types';
import { escapeRegExp } from '../../domain/utils';
import { ResponseParser } from './response.parser';

/** 文案"品质好/性价比高"等泛泛表达 —— 检测/剔除共用同一组关键词,提取到模块顶层避免重复正则。 */
const GENERIC_PHRASES_BASE = '品质好|性价比高|不容错过|心动不如行动|优惠力度大|吃货必备|赶快冲';
const GENERIC_PHRASES_PATTERN = new RegExp(`${GENERIC_PHRASES_BASE}`, 'g');
const GENERIC_PHRASES_DETECT = new RegExp(`${GENERIC_PHRASES_BASE}|尊敬的用户|欢迎选购`);
/** 商家简称里常出现的实体后缀,合并为单一字符类以便一次扫描。 */
const MERCHANT_SUFFIX_PATTERN = /餐厅|饭店|酒楼|门店|小吃|烧烤|烤肉|火锅|料理|茶饮|甜品/g;

export class CopyGenerator {
  private readonly parser = new ResponseParser();

  completeDrafts(
    pkg: ContentPackage,
    request: GenerateCopyRequest,
    drafts: AICopyDraft[],
    packageDetail: PackageDetail | null,
    count: number
  ): AICopyDraft[] {
    const completed = [...drafts];
    const fallbackDrafts = this.buildFallbackDrafts(pkg, request, packageDetail, count);
    for (const fallback of fallbackDrafts) {
      if (completed.length >= count) break;
      completed.push(fallback);
    }
    return completed;
  }

  polishDraft(
    pkg: ContentPackage,
    request: GenerateCopyRequest,
    draft: AICopyDraft,
    packageDetail: PackageDetail | null
  ): AICopyDraft {
    const title = this.parser.cleanGeneratedText(draft.title);
    const body = this.parser.cleanGeneratedText(draft.body);
    const cta = this.parser.cleanGeneratedText(draft.cta ?? '') || '立即下单';

    return {
      title: this.shouldReplaceTitle(title, pkg) ? this.buildSafeTitle(pkg, request) : title,
      body: this.shouldReplaceBody(body, pkg, packageDetail)
        ? this.buildSafeBody(pkg, request, packageDetail)
        : this.stripBadPhrases(body),
      cta
    };
  }

  private shouldReplaceTitle(title: string, pkg: ContentPackage): boolean {
    if (!title || title.length < 4) return true;
    if (this.parser.hasJsonLeak(title)) return true;
    if (/(?:套餐|双人餐|单人餐|多人餐)\s*[A-Za-z0-9]$/.test(title)) return true;
    if (/版本[A-Z]$/.test(title)) return true;
    if (this.treatsBrandAsFood(title, pkg)) return true;
    return false;
  }

  private shouldReplaceBody(
    body: string,
    pkg: ContentPackage,
    packageDetail: PackageDetail | null
  ): boolean {
    if (!body || body.length < 30) return true;
    if (this.parser.hasJsonLeak(body)) return true;
    if (this.looksGenericBody(body)) return true;
    if (!this.containsCurrentPrice(body, pkg)) return true;
    if (this.mentionsWrongPrice(body, pkg)) return true;
    if (pkg.stockLeft > 0 && !body.includes(String(pkg.stockLeft))) return true;
    const detailHighlights = this.detailHighlights(packageDetail, pkg);
    if (detailHighlights.length && !detailHighlights.some((item) => body.includes(item)))
      return true;
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
    const price = currentPrice(pkg);
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

  private buildSafeTitle(pkg: ContentPackage, request: GenerateCopyRequest): string {
    const noun = this.inferPackageNoun(pkg);
    const scenario = request.scenario?.trim() || '日常运营推荐';
    if (scenario.includes('库存')) return `今晚${noun}可用`;
    if (scenario.includes('开抢')) return `${noun}现在可下单`;
    if (scenario.includes('预告')) return `${noun}先看这条`;
    if (scenario.includes('转化')) return `${noun}值得看一眼`;
    return `今晚${noun}可用`;
  }

  private buildSafeBody(
    pkg: ContentPackage,
    request: GenerateCopyRequest,
    packageDetail: PackageDetail | null
  ): string {
    const price = currentPrice(pkg);
    const noun = this.inferPackageNoun(pkg);
    const details = this.detailHighlights(packageDetail, pkg).slice(0, 4).join('、') || noun;
    const rule = this.primaryUseRule(pkg);
    const opening = this.channelOpening(request.channel, noun);
    const stockLine =
      pkg.stockLeft > 0 ? `当前还剩${pkg.stockLeft}份` : '当前已售罄，适合做承接或等补货提醒';
    const ruleLine = rule ? `记得看规则：${rule}` : '下单前看好门店和可用时间';
    return [
      `${opening}，${this.shortMerchant(pkg.merchantName)}这个${noun}可以推。`,
      `￥${price}，${details}。`,
      `${stockLine}，${ruleLine}。`
    ].join('\n');
  }

  private detailHighlights(packageDetail: PackageDetail | null, pkg: ContentPackage): string[] {
    const detailItems =
      packageDetail?.sections
        ?.flatMap((section) => section.items.map((item) => item.name.trim()).filter(Boolean))
        .filter((item) => item.length <= 18) ?? [];
    const sellingPoints = pkg.sellingPoints.map((point) => point.trim()).filter(Boolean);
    return [...new Set([...detailItems, ...sellingPoints])];
  }

  private primaryUseRule(pkg: ContentPackage): string {
    return (
      pkg.useRules.find((rule) => rule.trim().length > 0 && rule.trim().length <= 36)?.trim() ?? ''
    );
  }

  private containsCurrentPrice(text: string, pkg: ContentPackage): boolean {
    const price = currentPrice(pkg);
    return text.includes(String(price));
  }

  private mentionsWrongPrice(text: string, pkg: ContentPackage): boolean {
    const pkgPrice = currentPrice(pkg);
    const wrongPrices = [pkg.welfarePrice, pkg.salePrice, pkg.temporarySalePrice].filter(
      (price): price is number =>
        typeof price === 'number' && Number.isFinite(price) && price > 0 && price !== pkgPrice
    );
    return wrongPrices.some((price) =>
      new RegExp(`(?:￥|¥|价|元|\\b)${escapeRegExp(String(price))}(?:元|\\b)`).test(text)
    );
  }

  private looksGenericBody(body: string): boolean {
    return GENERIC_PHRASES_DETECT.test(body);
  }

  private stripBadPhrases(body: string): string {
    return body
      .replace(GENERIC_PHRASES_PATTERN, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private channelOpening(channel: GenerateCopyRequest['channel'], noun: string): string {
    const openings: Record<GenerateCopyRequest['channel'], string> = {
      wechat_group: `群里问${noun}的可以看这条`,
      moments: `今天想安排${noun}的话可以看看`,
      merchant_share: `门店这份${noun}现在可下单`
    };
    return openings[channel];
  }

  private inferPackageNoun(pkg: ContentPackage): string {
    const name = pkg.packageName.replace(/[|｜]/g, ' ').replace(/\d+$/g, '');
    const KEYWORD_TO_NOUN: Array<[string, string]> = [
      ['双人', '双人餐'],
      ['单人', '单人餐'],
      ['多人', '多人餐'],
      ['烤肉', '烤肉'],
      ['火锅', '火锅'],
      ['下午茶', '下午茶'],
      ['亲子', '亲子套餐']
    ];
    const matched = KEYWORD_TO_NOUN.find(([keyword]) => name.includes(keyword));
    if (matched) return matched[1];
    if (pkg.category && pkg.category !== '餐饮') return pkg.category;
    return '这份套餐';
  }

  private treatsBrandAsFood(title: string, pkg: ContentPackage): boolean {
    const brand = this.extractAmbiguousBrand(pkg.merchantName);
    if (!brand) return false;
    return (
      title.includes(`想吃${brand}`) ||
      title.includes(`吃${brand}？`) ||
      title.includes(`吃${brand}?`)
    );
  }

  private extractAmbiguousBrand(merchantName: string): string {
    const shortName = merchantName
      .split(',')[0]
      .replace(/（.*?）/g, '')
      .trim();
    const normalized = shortName.replace(MERCHANT_SUFFIX_PATTERN, '');
    const ambiguousFoodWords = [
      '绿茶',
      '茶',
      '牛肉',
      '烤肉',
      '火锅',
      '烧烤',
      '鱼',
      '鸡',
      '鸭',
      '饭',
      '面',
      '粉'
    ];
    return ambiguousFoodWords.includes(normalized) ? normalized : '';
  }

  private shortMerchant(merchantName: string): string {
    return (
      merchantName
        .split(',')[0]
        .replace(/（.*?）/g, '')
        .trim() || merchantName
    );
  }

  private shortArea(areaName: string): string {
    return areaName.length > 6 ? areaName.slice(0, 6) : areaName;
  }
}
