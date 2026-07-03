// --- 中文标签映射 ---
import { formatRatePercent } from '@content/shared';

export const statusLabels: Record<string, string> = {
  pending_launch: '待开售',
  cold_start: '冷启动',
  healthy_sales: '销售中',
  surging: '快速增长',
  nearly_sold_out: '接近售罄',
  sold_out: '已售罄',
  poor_sales: '销售偏弱',
  high_refund_risk: '高退款风险',
  high_verify: '高核销',
  low_verify: '低核销',
  unclear_selling_point: '卖点不清',
  conversion_weak: '转化偏弱'
};

export const channelLabels: Record<string, string> = {
  wechat_group: '微信群',
  moments: '朋友圈',
  merchant_share: '商家转发'
};

export const alertTypeLabels: Record<string, string> = {
  continuous_unsold: '连续未售罄',
  abnormal_sold_out: '异常售罄',
  high_refund: '高退款',
  low_verify: '低核销',
  missing_use_rules: '使用规则缺失',
  missing_selling_points: '卖点缺失',
  inventory_abnormal: '库存异常',
  price_abnormal: '价格异常',
  merchant_abnormal: '商家异常'
};

export const auditStatusLabels: Record<string, string> = {
  draft: '草稿',
  pending: '待审核',
  approved: '通过',
  rejected: '驳回',
  risk: '风险'
};

export const groupTypeLabels: Record<string, string> = {
  office: '办公人群',
  parent_child: '亲子家庭',
  foodie: '吃喝群',
  merchant: '商家群',
  wellness: '休闲养生',
  mixed: '综合群'
};

// --- Element Plus Tag 类型映射 ---

export type TagType = 'success' | 'primary' | 'warning' | 'info' | 'danger';

export const levelTagType: Record<string, TagType> = {
  S: 'success',
  A: 'primary',
  B: 'warning',
  C: 'info',
  D: 'danger'
};

// --- 等级 → Element Plus Tag 类型的统一查找表 ---
// 所有 *TagType 函数的实现等价(把 level: 'success' | 'danger' | 'warning' | 'info' 映射到 TagType),
// 单一查找表,所有具名函数都从这里取,保持调用点的语义命名(便于阅读)。

type AlertLevel = 'success' | 'danger' | 'warning' | 'info';

const LEVEL_TO_TAG_TYPE: Record<AlertLevel, TagType> = {
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  info: 'info'
};

const ALERT_LEVELS: readonly AlertLevel[] = ['success', 'danger', 'warning', 'info'];

const isAlertLevel = (value: string): value is AlertLevel =>
  (ALERT_LEVELS as readonly string[]).includes(value);

const normalizeLevel = (level?: string): AlertLevel =>
  level && isAlertLevel(level) ? level : 'info';

/** 把风险/库存/销售等统一等级字符串映射到 Element Plus tag 类型。 */
export function levelToTagType(level?: string): TagType {
  return LEVEL_TO_TAG_TYPE[normalizeLevel(level)];
}

// 语义化别名 —— 保留调用点的领域命名(risk/inventory/sales/operation/alert),
// 同时确保任何等级的映射都走同一个查找表,改一处即可同步。

/** 根据风险等级返回 Element Plus tag 类型 */
export const riskTagType = levelToTagType;

/** 库存标记 tag 类型 */
export const inventoryTagType = levelToTagType;

/** 销售判断 tag 类型 */
export const salesTagType = levelToTagType;

/** 作战标签 tag 类型 */
export const operationTagType = levelToTagType;

/** 警报 tag 类型(语义同 riskTagType,用于 Dashboard 中的 alertTagType) */
export const alertTagType = levelToTagType;

/** 预警等级中文文本 */
export function levelText(level?: string): string {
  const normalized = normalizeLevel(level);
  if (normalized === 'danger') return '高危';
  if (normalized === 'warning') return '警告';
  return '提醒';
}

// --- 格式化辅助函数 ---

/** 显示价格：优先使用临时售价，否则使用普通售价 */
export function displayPrice(row: {
  temporarySalePrice?: number | null;
  salePrice?: number;
}): string {
  const price = row.temporarySalePrice ?? row.salePrice;
  if (price == null) return '-';
  return `${price}`;
}

/** 格式化金额为 xxx 或 xxx.xx */
export function formatMoney(value?: number, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return '-';
  return `${value.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** 百分比格式化 */
export const percent = formatRatePercent;

/** 时间格式化（仅显示时:分） */
export function formatTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/** 评分 tooltip：用 dimensions 拼接成 "维度 分数 / 维度 分数" */
export function scoreTooltip(
  score: { dimensions?: Array<{ label: string; score: number }> } | null | undefined
): string {
  if (!score?.dimensions?.length) return '';
  return score.dimensions
    .slice(0, 4)
    .map((item) => `${item.label} ${Math.round(item.score)}`)
    .join(' / ');
}
