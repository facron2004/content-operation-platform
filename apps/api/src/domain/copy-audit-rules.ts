import type { AuditStatus, ContentPackage, StrategyType } from '@content/shared';
import { priceString } from './utils';
import type { CopyRuleConfig } from './rules-defaults';

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

const forbiddenWords = ['全网最低', '最后疯抢', '错过后悔', '稳赚', '保证返利'];

// 审核用的业务正则 —— 提到模块顶层,避免每次 auditCopyText 调用都重编译
const INVENTED_PRICE_RE =
  /(?:原价|福利价|优惠价|今日价|当前可用价)\s*\d+(?:\.\d+)?|(?:\d+(?:\.\d+)?)\s*元/;
const BARGAIN_PRICE_9_9_RE = /(^|[^\d.])9\.9([^\d.]|$)/;
const STOCK_MENTION_RE = /剩余\d+|限量\d+/;
const SOLD_OUT_FORBIDDEN_RE = /开抢|可抢|抢购/;

/** Residual #133: only price/stock/useRules are consulted — full ContentPackage not required. */
export type AuditPackageInput = Pick<
  ContentPackage,
  'originalPrice' | 'salePrice' | 'temporarySalePrice' | 'stockTotal' | 'stockLeft' | 'useRules'
>;

export function auditCopyText(
  pkg: AuditPackageInput,
  copy: CopyDraftForAudit,
  rules?: Pick<CopyRuleConfig, 'forbiddenWords'>
): AuditResult {
  const riskTips: string[] = [];
  const text = `${copy.title}\n${copy.body}`;
  const words = rules?.forbiddenWords ?? forbiddenWords;

  for (const word of words) {
    if (text.includes(word)) riskTips.push(`包含禁用或绝对化表述：${word}`);
  }

  // Inline currentPrice (temporarySalePrice ?? salePrice) so AuditPackageInput need not be full ContentPackage.
  const pkgPrice = pkg.temporarySalePrice ?? pkg.salePrice;
  const expectedPrices = [priceString(pkg.originalPrice), priceString(pkgPrice)];
  const hasKnownPrice = expectedPrices.some((price) => price && text.includes(price));
  const inventedPrice = INVENTED_PRICE_RE.test(text) && !hasKnownPrice;
  if (inventedPrice || (BARGAIN_PRICE_9_9_RE.test(text) && !expectedPrices.includes('9.9'))) {
    riskTips.push('文案价格与套餐价格不一致');
  }

  const mentionsStock = STOCK_MENTION_RE.test(text);
  if (mentionsStock && !text.includes(`${pkg.stockLeft}`) && !text.includes(`${pkg.stockTotal}`)) {
    riskTips.push('文案库存与实时库存不一致');
  }

  if (pkg.stockLeft <= 0 && SOLD_OUT_FORBIDDEN_RE.test(text)) {
    riskTips.push('售罄套餐不得继续宣传可抢');
  }

  for (const rule of pkg.useRules) {
    const normalizedRule = rule.trim();
    if (normalizedRule && !text.includes(normalizedRule)) {
      riskTips.push(`文案缺少使用限制：${normalizedRule}`);
    }
  }

  const riskLevel = riskTips.some((tip) =>
    ['禁用', '价格', '库存'].some((keyword) => tip.includes(keyword))
  )
    ? 'high'
    : riskTips.length > 0
      ? 'medium'
      : 'low';

  return { riskLevel, riskTips, auditStatus: riskLevel === 'high' ? 'risk' : 'pending' };
}
