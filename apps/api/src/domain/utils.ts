import type { PromotionLevel } from '@content/shared';
import { formatPrice } from '@content/shared';

// 重新导出 shared 的权威版本,domain 层统一从 utils 引入
export { formatPrice };

/** 将数值限制在 [min, max] 范围内 */
export const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

/** 根据推广分计算等级 */
export const scoreLevel = (score: number): PromotionLevel => {
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'C';
  return 'D';
};

/**
 * 动态兜底日期:取当前时间往前推 1 天,避免硬编码过期日期。
 * 用于 promotion score 计算时没有传入日期的场景。
 */
export function getFallbackDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

/** 把多空白、多竖线分隔统一压成空格 + 「、」 */
export const compact = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/[｜|]+/g, '、')
    .trim();

/** 对字符串数组做 compact + 去重 + 去空 */
export const uniqueText = (items: string[]) => [...new Set(items.map(compact).filter(Boolean))];

/**
 * 价格字符串(用于文案"包含检查"等场景)。
 * null/undefined/NaN 返回空串(便于字符串包含匹配);其他数字 → 直接转字符串。
 */
export const priceString = (value?: number | null): string =>
  value === null || value === undefined || Number.isNaN(value) ? '' : String(value);
