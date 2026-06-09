// --- 中文标签映射 ---

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

export const strategyLabels: Record<string, string> = {
  preheat: '预热策略',
  launch: '开抢策略',
  sprint: '冲刺策略',
  fallback: '承接策略',
  wake_up: '唤醒策略',
  conversion_optimize: '转化优化',
  verify_reminder: '核销提醒',
  merchant_co_promotion: '商家共推',
  leader_growth: '团长裂变'
};

export const channelLabels: Record<string, string> = {
  wechat_group: '微信群',
  moments: '朋友圈',
  merchant_share: '商家转发'
};

export const operationTagLabels: Record<string, string> = {
  hot_restock_needed: '爆品待补货',
  continuous_slow: '连续滞销',
  high_refund_risk: '高退款风险',
  high_verify_quality: '高核销优质',
  ending_clearance: '临期清仓',
  price_advantage: '价格优势明显',
  fallback_package: '承接套餐',
  community_focus: '社群专推'
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

export const groupTypeLabels: Record<string, string> = {
  office: '办公人群',
  parent_child: '亲子家庭',
  foodie: '吃喝群',
  merchant: '商家群',
  wellness: '休闲养生',
  mixed: '综合群'
};

export const packageTypeLabels: Record<string, string> = {
  commission: '佣金套餐',
  welfare: '福利套餐',
  fallback: '承接套餐'
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

/** 根据风险等级（danger / warning / success / info）返回 Element Plus tag 类型 */
export function riskTagType(level?: string): TagType {
  if (level === 'danger') return 'danger';
  if (level === 'warning') return 'warning';
  if (level === 'success') return 'success';
  return 'info';
}

/** 库存标记 tag 类型 */
export function inventoryTagType(level?: string): TagType {
  if (level === 'danger') return 'danger';
  if (level === 'warning') return 'warning';
  return 'info';
}

/** 销售判断 tag 类型 */
export function salesTagType(level?: string): TagType {
  if (level === 'success') return 'success';
  if (level === 'danger') return 'danger';
  if (level === 'warning') return 'warning';
  return 'info';
}

/** 作战标签 tag 类型 */
export function operationTagType(level?: string): TagType {
  if (level === 'danger') return 'danger';
  if (level === 'warning') return 'warning';
  if (level === 'success') return 'success';
  return 'info';
}

// --- 格式化辅助函数 ---

/** 显示价格：优先使用临时售价，否则使用普通售价 */
export function displayPrice(row: { temporarySalePrice?: number | null; salePrice?: number }): string {
  const price = row.temporarySalePrice ?? row.salePrice;
  if (price == null) return '-';
  return `¥${price}`;
}

/** 格式化金额为 ¥xxx 或 ¥xxx.xx */
export function formatMoney(value?: number, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return '-';
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** 百分比格式化 */
export function percent(value?: number, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return '-';
  return `${(value * 100).toFixed(decimals)}%`;
}

/** 时间格式化（仅显示时:分） */
export function formatTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/** 日期格式化（YYYY-MM-DD） */
export function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toISOString().slice(0, 10);
}

/** 评分 tooltip：用 dimensions 拼接成 "维度 分数 / 维度 分数" */
export function scoreTooltip(score: { dimensions?: Array<{ label: string; score: number }> } | null | undefined): string {
  if (!score?.dimensions?.length) return '';
  return score.dimensions
    .slice(0, 4)
    .map((item) => `${item.label} ${Math.round(item.score)}`)
    .join(' / ');
}

/** 判断商家名称是否需要 tooltip（含逗号表示多店通用） */
export function isMerchantNameTruncated(merchantName: string): boolean {
  return merchantName.includes(',');
}

/** 预警等级中文文本 */
export function levelText(level?: string): string {
  if (level === 'danger') return '高危';
  if (level === 'warning') return '警告';
  return '提醒';
}

/** 警报 tag 类型（同 riskTagType 但语义不同：用于 Dashboard 中的 alertTagType） */
export function alertTagType(level?: string): TagType {
  if (level === 'danger') return 'danger';
  if (level === 'warning') return 'warning';
  return 'info';
}
