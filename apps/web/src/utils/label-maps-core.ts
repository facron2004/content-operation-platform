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
