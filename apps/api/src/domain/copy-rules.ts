import type {
  AuditStatus,
  ContentPackage,
  GeneratedCopy,
  GenerateCopyRequest,
  PromotionScore,
  StrategyType
} from '@content/shared';
import { getSubwayStation } from './subway-stations';
import { getCategoryEmoji, getDishEmoji } from './category-emoji';

// Re-export for external consumers
export type { PackageDetail } from '../content/package-detail.service';

interface CopyDraftForAudit {
  title: string;
  body: string;
  strategyType: StrategyType;
}

interface AuditResult {
  riskLevel: 'low' | 'medium' | 'high';
  riskTips: string[];
  auditStatus: AuditStatus;
}

type PackageDetail = import('../content/package-detail.service').PackageDetail;

const forbiddenWords = ['全网最低', '最后疯抢', '错过后悔', '稳赚', '保证返利'];
const versionLetters = ['A', 'B', 'C', 'D', 'E'];
const defaultScenario = '日常运营推荐';

// ---- 纯工具函数 ----

const formatPrice = (value?: number | null): string =>
  value === null || value === undefined ? '' : String(value);

const primaryPrice = (pkg: ContentPackage) =>
  pkg.temporarySalePrice ?? pkg.salePrice;

const calculateSavings = (originalPrice: number, currentPrice: number): number =>
  Math.round(originalPrice - currentPrice);

const getStoreCount = (useRules: string[]): number | null => {
  for (const rule of useRules) {
    const match = rule.match(/(\d+)门店通用/);
    if (match) return parseInt(match[1]);
  }
  return null;
};

// ---- 商家名解析 ----

const extractLocationNames = (merchantName: string): string[] => {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of merchantName.split(',')) {
    const match = part.match(/（(.+?)）/);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      names.push(match[1]);
    }
  }
  return names;
};

const extractBrandShortName = (merchantName: string): string => {
  const cleaned = merchantName.split(',')[0].replace(/（.*?）/g, '').trim();
  return cleaned.split('·')[0].trim() || cleaned;
};

const extractBrandFullName = (merchantName: string): string =>
  merchantName.split(',')[0].replace(/（.*?）/g, '').trim();

const simplifyPackageName = (packageName: string, brandShort: string): string => {
  const cleaned = packageName.replace(
    new RegExp(`^${brandShort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[|｜]\\s*`, 'i'),
    ''
  );
  return cleaned.trim() || packageName;
};

// ---- 套餐详情格式化 ----

const formatPackageDetail = (detail: PackageDetail | null, separator: string): string => {
  if (!detail?.sections?.length) return '';
  const parts: string[] = [];
  for (const section of detail.sections) {
    if (!section.items?.length) continue;
    const items = section.items.map(i => i.name);
    if (!items.length) continue;
    const emoji = getDishEmoji(items[0]);
    if (items.length > 1) {
      const selectCount = items.length > 3 ? 2 : 1;
      parts.push(`${emoji}${items.join('/')}${items.length}选${selectCount}`);
    } else {
      parts.push(`${emoji}${items[0]}`);
    }
  }
  return parts.join(separator);
};

// ---- 地址文案 ----

const buildLocationLine = (pkg: ContentPackage, brandShort: string, locationNames: string[]): string => {
  const storeCount = getStoreCount(pkg.useRules);
  if (storeCount && storeCount > 1 && locationNames.length > 0) {
    const shown = locationNames.slice(0, 5).join('/');
    const suffix = locationNames.length > 5 ? '等' : '';
    return `📍 ${storeCount}店适用：${shown}${suffix}  打开定位搜${brandShort}就近下单核销！`;
  }
  const station = getSubwayStation(pkg.areaName || pkg.areaId, pkg.merchantName);
  return `📍 ${pkg.areaName}${station}站附近`;
};

// ---- 标题上下文（预计算一次，5个版本共享） ----

interface TitleCtx {
  station: string;
  brandShort: string;
  brandFull: string;
  category: string;
  currentPrice: number;
  savings: number;
  discountZhe: number;
  storeCount: number | null;
  locationNames: string[];
}

const buildTitleCtx = (pkg: ContentPackage): TitleCtx => {
  const currentPrice = primaryPrice(pkg);
  return {
    station: getSubwayStation(pkg.areaName || pkg.areaId, pkg.merchantName),
    brandShort: extractBrandShortName(pkg.merchantName),
    brandFull: extractBrandFullName(pkg.merchantName),
    category: pkg.category,
    currentPrice,
    savings: calculateSavings(pkg.originalPrice, currentPrice),
    discountZhe: Math.round((currentPrice / pkg.originalPrice) * 10),
    storeCount: getStoreCount(pkg.useRules),
    locationNames: extractLocationNames(pkg.merchantName),
  };
};

// ---- 5个标题构建器 ----

type TitleBuilder = (ctx: TitleCtx, pkg: ContentPackage, promotion?: PromotionScore) => string;

const buildTitlePrice: TitleBuilder = (ctx, pkg) => {
  if (ctx.savings >= 100) return `🚇${ctx.station}站&${ctx.brandShort}某团${pkg.originalPrice}！立省${ctx.savings}！今天去吃可以用！`;
  if (ctx.savings >= 50) return `🚇${ctx.station}站&${ctx.brandShort}某团${pkg.originalPrice}！立省${ctx.savings}！`;
  if (ctx.discountZhe <= 3) return `🚇${ctx.station}站&${ctx.brandShort}某团${pkg.originalPrice}！${ctx.discountZhe}折拿下！`;
  return `🚇${ctx.station}站&${ctx.brandShort}某团${pkg.originalPrice}！现价${ctx.currentPrice}`;
};

const buildTitleDiscount: TitleBuilder = (ctx, pkg) => {
  if (ctx.discountZhe <= 3) return `🚇${ctx.station}站&${ctx.brandShort}某团${pkg.originalPrice}！${ctx.discountZhe}折拿下！今天去吃可以用！`;
  if (ctx.discountZhe <= 5) return `🚇${ctx.station}站&${ctx.category}${ctx.discountZhe}折！今天去吃可以用！`;
  return `🚇${ctx.station}站&${ctx.brandShort}${ctx.category}特惠！${ctx.discountZhe}折拿下！`;
};

const buildTitleMultiStore: TitleBuilder = (ctx, _pkg) => {
  if (ctx.storeCount && ctx.storeCount > 1 && ctx.locationNames.length > 0) {
    const areaSummary = ctx.locationNames.slice(0, 3).map(s => s.replace('店', '')).join('');
    return `🚇${ctx.station}站&${ctx.brandShort}${areaSummary}都有店`;
  }
  return `🚇${ctx.station}站&${ctx.brandShort}${ctx.category}`;
};

const buildTitleComprehensive: TitleBuilder = (ctx, pkg) => {
  if (ctx.storeCount && ctx.storeCount > 1 && ctx.discountZhe <= 4) {
    return `🚇${ctx.station}站&${ctx.brandShort}某团${pkg.originalPrice}！${ctx.storeCount}店通用${ctx.discountZhe}折！`;
  }
  if (ctx.storeCount && ctx.storeCount > 1) {
    return `🚇${ctx.station}站&${ctx.brandShort}${ctx.storeCount}店通用！立省${ctx.savings}`;
  }
  if (ctx.savings >= 50) {
    return `🚇${ctx.station}站&${ctx.category}，某团${pkg.originalPrice}！立省一半！`;
  }
  return `🚇${ctx.station}站&${ctx.brandShort}${ctx.category}特惠推荐`;
};

const buildTitleScene: TitleBuilder = (ctx, pkg, promotion) => {
  if (promotion?.status === 'nearly_sold_out') {
    return `🚇${ctx.station}站&${ctx.category}限时特惠！库存不多手慢无！`;
  }
  if (ctx.discountZhe <= 3) return `🚇${ctx.station}站&${ctx.brandShort}￥${ctx.currentPrice}拿下！某团原价${pkg.originalPrice}！`;
  if (ctx.savings >= 50) return `🚇${ctx.station}站&${ctx.brandShort}￥${ctx.currentPrice}！比某团省${ctx.savings}！`;
  return `🚇${ctx.station}站&${ctx.brandShort}￥${ctx.currentPrice}超值！${ctx.category}特惠`;
};

// ---- 正文构建 ----

const buildBody = (
  pkg: ContentPackage,
  detail: PackageDetail | null,
  fmt: '+' | '\n',
  ctx: TitleCtx,
): string => {
  const currentPrice = primaryPrice(pkg);
  const simpleName = simplifyPackageName(pkg.packageName, ctx.brandShort);
  const lines: string[] = [];
  lines.push(`￥${currentPrice} ${ctx.brandFull}丨${simpleName}`);
  const detailText = formatPackageDetail(detail, fmt);
  if (detailText) {
    lines.push(detailText);
  } else {
    lines.push(`${getCategoryEmoji(pkg.category)}${simpleName}`);
  }
  lines.push(pkg.stockLeft <= 0 ? '当前已售罄，可引导关注同店替代套餐或下次补货。' : `当前剩余${pkg.stockLeft}份`);
  if (pkg.useRules.length > 0) lines.push(`使用规则：${pkg.useRules.join('、')}`);
  lines.push(buildLocationLine(pkg, ctx.brandShort, ctx.locationNames));
  return lines.join('\n');
};

// ---- CTA 构建 ----

const buildCta = (pkg: ContentPackage): string => {
  const path = pkg.miniProgramPath;
  return path ? `快速下单戳👉${path}` : '快速下单戳👉';
};

// ---- 审核逻辑 ----

export function auditCopyText(pkg: ContentPackage, copy: CopyDraftForAudit): AuditResult {
  const riskTips: string[] = [];
  const text = `${copy.title}\n${copy.body}`;

  for (const word of forbiddenWords) {
    if (text.includes(word)) riskTips.push(`包含禁用或绝对化表述：${word}`);
  }

  const currentPrice = primaryPrice(pkg);
  const expectedPrices = [formatPrice(pkg.originalPrice), formatPrice(currentPrice)];
  const hasKnownPrice = expectedPrices.some((price) => price && text.includes(price));
  const inventedPrice = /(?:原价|福利价|优惠价|今日价|当前可用价)\s*\d+(?:\.\d+)?|(?:\d+(?:\.\d+)?)\s*元/.test(text) && !hasKnownPrice;
  if (inventedPrice || (/(^|[^\d.])9\.9([^\d.]|$)/.test(text) && !expectedPrices.includes('9.9'))) {
    riskTips.push('文案价格与套餐价格不一致');
  }

  const mentionsStock = /剩余\d+|限量\d+/.test(text);
  if (mentionsStock && !text.includes(`${pkg.stockLeft}`) && !text.includes(`${pkg.stockTotal}`)) {
    riskTips.push('文案库存与实时库存不一致');
  }

  if (pkg.stockLeft <= 0 && /开抢|可抢|抢购/.test(text)) {
    riskTips.push('售罄套餐不得继续宣传可抢');
  }

  for (const rule of pkg.useRules) {
    const normalizedRule = rule.trim();
    if (normalizedRule && !text.includes(normalizedRule)) {
      riskTips.push(`文案缺少使用限制：${normalizedRule}`);
    }
  }

  const riskLevel = riskTips.some((tip) => tip.includes('禁用') || tip.includes('价格') || tip.includes('库存'))
    ? 'high'
    : riskTips.length > 0
      ? 'medium'
      : 'low';

  return { riskLevel, riskTips, auditStatus: riskLevel === 'high' ? 'risk' : 'pending' };
}

// ---- 主入口 ----

interface VersionConfig {
  titleBuilder: TitleBuilder;
  bodyFmt: '+' | '\n';
  strategy: StrategyType;
}

export function generateTemplateCopies(
  pkg: ContentPackage,
  promotion: PromotionScore,
  request: GenerateCopyRequest,
  packageDetail: PackageDetail | null = null
): GeneratedCopy[] {
  const count = Math.max(1, Math.min(request.copyCount || 3, 5));
  const scenario = request.scenario?.trim() || defaultScenario;
  const now = new Date().toISOString();
  const baseTimestamp = Date.now();

  // 预计算一次共享上下文
  const ctx = buildTitleCtx(pkg);

  const versionConfigs: VersionConfig[] = [
    { titleBuilder: buildTitlePrice, bodyFmt: '\n', strategy: 'conversion_optimize' as StrategyType },
    { titleBuilder: buildTitleDiscount, bodyFmt: '+', strategy: 'sprint' as StrategyType },
    { titleBuilder: buildTitleMultiStore, bodyFmt: '+', strategy: 'merchant_co_promotion' as StrategyType },
    { titleBuilder: buildTitleComprehensive, bodyFmt: '\n', strategy: promotion.recommendedStrategy },
    { titleBuilder: buildTitleScene, bodyFmt: '\n', strategy: 'launch' as StrategyType },
  ];

  return Array.from({ length: count }).map((_, index) => {
    const config = versionConfigs[index] || versionConfigs[0];
    const title = config.titleBuilder(ctx, pkg, promotion);
    const body = buildBody(pkg, packageDetail, config.bodyFmt, ctx);
    const cta = buildCta(pkg);
    const audit = auditCopyText(pkg, { title, body, strategyType: config.strategy });

    return {
      contentId: `C${baseTimestamp}${Math.random().toString(36).substr(2, 5)}`,
      packageId: pkg.packageId,
      areaId: pkg.areaId,
      merchantId: pkg.merchantId,
      channel: request.channel,
      scenario,
      title,
      body,
      cta,
      copyVersion: versionLetters[index] ?? `${index + 1}`,
      strategyType: config.strategy,
      riskLevel: audit.riskLevel,
      riskTips: [...promotion.riskTips, ...audit.riskTips],
      auditStatus: audit.auditStatus === 'risk' ? 'risk' : 'pending',
      auditRemark: audit.riskTips.join('；') || null,
      createdBy: request.createdBy ?? 'system',
      createdAt: now,
      updatedAt: now,
    };
  });
}
