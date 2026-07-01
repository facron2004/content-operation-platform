import type { PromotionLevel } from '@content/shared';
import { formatPrice } from '@content/shared';

// 重新导出 shared 的权威版本,domain 层统一从 utils 引入
export { formatPrice };

/**
 * 库存滞销/连续未售罄的临界天数,跨 promotion-rules / content.service / inventory-flags 共用。
 * `>= INVENTORY_BACKLOG_DAYS_THRESHOLD` 视为需要换卖点或降曝光的滞销套餐。
 */
export const INVENTORY_BACKLOG_DAYS_THRESHOLD = 3;

/**
 * 库存连续未售罄 2 天即触发"warning"标记的临界天数,跨 inventory-flags 内部与推广策略共用。
 */
export const INVENTORY_SLOW_DAYS_THRESHOLD = 2;

/**
 * 退款率临界值,跨 promotion-rules / operation-tags / package-score 共用。
 * `>= HIGH_REFUND_RATE_THRESHOLD` 视为高退款,需在评分/策略/标签上降级或拒绝强推广。
 */
export const HIGH_REFUND_RATE_THRESHOLD = 0.15;

/**
 * 核销率临界值,跨 promotion-rules / operation-tags / package-score 共用。
 * `>= HEALTHY_VERIFY_RATE_THRESHOLD` 视为核销健康,作为评分加分与"高核销"标签的判定线。
 */
export const HEALTHY_VERIFY_RATE_THRESHOLD = 0.7;

/**
 * 销售速度(单量/时间单位)临界值,跨 promotion-rules / operation-tags 共用。
 * `>= SALES_SPEED_HOT_THRESHOLD` 视为"快销",触发 nearly_sold_out / hot_restock_needed 等标签。
 */
export const SALES_SPEED_HOT_THRESHOLD = 5;

/** 将数值限制在 [min, max] 范围内 */
export const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

/** 将数值钳到非负数,语义等同 Math.max(0, value) */
export const clampNonNegative = (value: number): number => Math.max(0, value);

/** 一天的毫秒数,跨库存滞销 / 套餐上架天数计算共用 */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 重试基础延迟(毫秒),配合指数退避:delay = BASE * 2^attempt */
export const RETRY_BASE_DELAY_MS = 1000;

/** 按字符串日期字段升序排序(YYYY-MM-DD 等可字典序比较的日期格式) */
export const sortByDateKey =
  <T>(key: (item: T) => string) =>
  (a: T, b: T): number =>
    key(a).localeCompare(key(b));

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
