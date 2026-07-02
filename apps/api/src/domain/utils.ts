import type { PromotionLevel } from '@content/shared';
import { clamp, formatPrice } from '@content/shared';

// 重新导出 shared 的权威版本,domain 层统一从 utils 引入
export { clamp, formatPrice };

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

/** 将数值限制在 [min, max] 范围内(重导出见文件头) */

/** 将数值钳到非负数,语义等同 Math.max(0, value) */
export const clampNonNegative = (value: number): number => Math.max(0, value);

/** 一天的毫秒数,跨库存滞销 / 套餐上架天数计算共用 */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 一小时的毫秒数,跨时效判断(到期时间差等)共用 */
export const MS_PER_HOUR = 60 * 60 * 1000;

/** 一分钟的毫秒数,跨登录退避 / 速率限制 / 缓存 TTL 共用 */
export const MS_PER_MINUTE = 60 * 1000;

/**
 * 推广促销里"surging"档位要求最近一次转化率达到的临界值,
 * promotion-rules 与 operation-battle 文案口径一致,跨这两个文件共用。
 */
export const SURGING_CONVERSION_RATE_THRESHOLD = 0.1;

/**
 * 核销率过低的下限(用于触发 low_verify 标签/状态)。
 * promotion-rules 与 operation-tags 共用,口径需保持一致。
 */
export const LOW_VERIFY_RATE_THRESHOLD = 0.25;

/**
 * 折扣率"显著"分界:`<= 0.5` 即"低至 5 折及以下",触发 price_advantage 标签
 * 和 operation-battle 文案分支。两处复用同一阈值。
 */
export const DEEP_DISCOUNT_RATIO_THRESHOLD = 0.5;

/** 重试基础延迟(毫秒),配合指数退避:delay = BASE * 2^attempt */
export const RETRY_BASE_DELAY_MS = 1000;

/** 重试延迟上限(毫秒),防止指数退避下延迟无限增长 */
export const RETRY_MAX_DELAY_MS = 3000;

/**
 * 退款率"健康上限":与 HEALTHY_VERIFY_RATE_THRESHOLD 配对使用,
 * promotion-rules 与 operation-tags 共同作为"高核销 + 低退款"标签/状态的判定门。
 */
export const HEALTHY_VERIFY_REFUND_RATE_CAP = 0.05;

/**
 * 转化率"明显偏弱"分界:点击 ≥ 100 但转化低于此值时进入 conversion_weak 状态。
 * promotion-rules 使用。
 */
export const CONVERSION_WEAK_RATE_THRESHOLD = 0.06;

/**
 * 转化率"明显优秀"分界:operation-battle 在筛选高转化文案示例时使用,
 * >= 此值即被标注为高转化并给予承接建议。
 */
export const HIGH_CONVERSION_RATE_THRESHOLD = 0.12;

/**
 * 进入 surging 状态所需的销售速度,与 SURGING_CONVERSION_RATE_THRESHOLD 配对使用。
 * 比 SALES_SPEED_HOT_THRESHOLD(5) 高一档,表示真正爆品的速度门槛。
 * promotion-rules 使用。
 */
export const SURGING_SALES_SPEED_THRESHOLD = 20;

/**
 * 进入 nearly_sold_out 状态所需的最低已支付单量,promotion-rules 使用。
 */
export const NEARLY_SOLD_OUT_PAID_ORDER_THRESHOLD = 10;

/**
 * poor_sales 状态的上限订单量(>= 1500 曝光但订单数低于此值),
 * promotion-rules 使用。
 */
export const POOR_SALES_ORDER_COUNT_THRESHOLD = 8;

/**
 * low_verify 状态所需的最低已支付单量(配合 LOW_VERIFY_RATE_THRESHOLD),
 * promotion-rules 与 operation-tags 共用,口径需保持一致。
 */
export const LOW_VERIFY_PAID_ORDER_COUNT_THRESHOLD = 12;

/**
 * stockCue 中触发"限量提醒"文案的最大库存值,operation-battle 使用。
 * `pkg.stockLeft <= LOW_STOCK_WARNING_THRESHOLD` 视为限量剩余,适合做限量话术。
 */
export const LOW_STOCK_WARNING_THRESHOLD = 10;

/**
 * buildDerivedCommunities 一次性输出的最大社群数,
 * operation-battle 使用,避免无限增长导致前端渲染负担。
 */
export const MAX_DERIVED_COMMUNITY_GROUPS = 12;

/**
 * data-source 分页抓取时,失败页数占比超过此阈值即认为整页失败,触发跳过/告警。
 * data-source.service 使用。
 */
export const PAGE_FAILURE_RATIO_THRESHOLD = 0.3;

/**
 * package-score 中"佣金分"权重:commissionRate * 450 表示每 1% 佣金率贡献 4.5 分(封顶 100)。
 * 与 grossProfit 权重配对使用。
 */
export const COMMISSION_RATE_SCORE_WEIGHT = 450;

/**
 * package-score 中"毛利分"权重:grossProfit * 2 表示每 1 元毛利贡献 2 分(封顶 100)。
 * 与 commissionRate 权重配对使用。
 */
export const GROSS_PROFIT_SCORE_WEIGHT = 2;

/**
 * package-score 中退款率得分的乘法系数:
 * score = 100 - refundRate * 520,确保退款率达 0.15 时扣除接近 78 分。
 */
export const REFUND_RATE_SCORE_MULTIPLIER = 520;

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

/** 正则元字符转义,跨 copy-rules / ai-copy/copy.generator 共用 */
export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 价格字符串(用于文案"包含检查"等场景)。
 * null/undefined/NaN 返回空串(便于字符串包含匹配);其他数字 → 直接转字符串。
 */
export const priceString = (value?: number | null): string =>
  value === null || value === undefined || Number.isNaN(value) ? '' : String(value);

/** cold_start 状态的最大曝光量上限(曝光未达此值视为冷启动),promotion-rules 使用。 */
export const EXPOSURE_COLD_START_MAX = 500;

/** 触发 unclear_selling_point 状态所需的最低曝光量(>= 此值且 CTR < CTR 阈值),
 *  promotion-rules 使用。 */
export const EXPOSURE_UNCLEAR_SELLING_POINT_MIN = 1500;

/** 触发 conversion_weak 状态所需的最低点击量(>= 此值且转化率 < CONVERSION_WEAK_RATE_THRESHOLD),
 *  promotion-rules 使用。 */
export const CLICK_CONVERSION_WEAK_MIN = 100;

/** 不清楚卖点判定所需的最低 CTR,promotion-rules 使用。 */
export const CTR_UNCLEAR_SELLING_POINT_MAX = 0.05;

/** poor_sales 判定所需的最低曝光量(>= 此值但订单数 < POOR_SALES_ORDER_COUNT_THRESHOLD),
 *  promotion-rules 使用。 */
export const EXPOSURE_POOR_SALES_MIN = 1500;

/**
 * 指数退避(2^attempt * base),结果被 maxMs 封顶。
 * 用于:
 * - ai-copy/retry.handler (RETRY_BASE_DELAY_MS / RETRY_MAX_DELAY_MS, attempt 0/1/2)
 * - content/data-source.service 同上
 * - content/auto-login.service 登录失败冷却 (COOLDOWN_BASE_MS / COOLDOWN_MAX_MS, attempt 起始 0)
 */
export const exponentialBackoff = (attempt: number, baseMs: number, maxMs: number): number =>
  Math.min(maxMs, baseMs * Math.pow(2, attempt));
