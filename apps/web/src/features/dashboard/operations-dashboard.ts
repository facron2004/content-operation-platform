export type DashboardTimeRange = 'realtime' | 'today' | 'yesterday' | '7d' | '30d';
export type DashboardCompositionTab = 'region' | 'category' | 'channel';
export type DashboardPackageTab = 'hot' | 'growing' | 'risk' | 'stock';
export type DashboardTrendMetric = 'gmv' | 'orders' | 'verify' | 'refund';

export interface DashboardFilters {
  timeRange: DashboardTimeRange;
  region: string;
  business: string;
  channel: string;
  merchant: string;
}

export interface DashboardKpi {
  key: string;
  label: string;
  value: number;
  format: 'currency' | 'count';
  helper: string;
  secondary: string;
  tone: 'blue' | 'teal' | 'green' | 'purple' | 'orange' | 'danger';
  icon: 'coin' | 'orders' | 'verify' | 'users' | 'new-users' | 'refund';
  risk?: boolean;
}

export interface DashboardTrendPoint {
  label: string;
  gmv: number;
  orders: number;
  verify: number;
  refund: number;
  yesterdayGmv: number;
}

export interface DashboardFunnelStage {
  label: string;
  value: number;
  rate: number;
  color: string;
}

export interface DashboardBreakdownItem {
  label: string;
  value: number;
  share: number;
  color: string;
}

export interface DashboardMerchant {
  name: string;
  area: string;
  gmv: number;
  orders: number;
  verifyRate: number;
  refundRate: number;
  health: '优秀' | '正常' | '风险';
}

export interface DashboardPackage {
  name: string;
  merchant: string;
  gmv: number;
  sales: number;
  conversion: number;
  refundRate: number;
  remaining?: number;
  selloutMinutes?: number;
}

export interface DashboardUserData {
  stats: Array<{ label: string; value: number; tone: string }>;
  lifecycle: DashboardBreakdownItem[];
  dormantHighValue: number;
  recallConversion: number;
}

export interface DashboardCommunityData {
  stats: Array<{ label: string; value: number; format: 'count' | 'currency'; tone: string }>;
  groups: Array<{ name: string; gmv: number; activity: number }>;
  bestSendTime: string;
  bestSendReason: string;
}

export interface DashboardAlert {
  id: string;
  level: 'high' | 'medium' | 'opportunity';
  title: string;
  metric: string;
  comparison: string;
  change: string;
  reason: string;
  suggestion: string;
  action: string;
}

export interface OperationsDashboardData {
  title: string;
  updatedAt: string;
  kpis: DashboardKpi[];
  trendByRange: Record<DashboardTimeRange, DashboardTrendPoint[]>;
  funnel: DashboardFunnelStage[];
  breakdowns: Record<DashboardCompositionTab, DashboardBreakdownItem[]>;
  merchants: DashboardMerchant[];
  packages: Record<DashboardPackageTab, DashboardPackage[]>;
  users: DashboardUserData;
  community: DashboardCommunityData;
  alerts: DashboardAlert[];
}

export const DEFAULT_FILTERS: DashboardFilters = {
  timeRange: 'today',
  region: '全部区域',
  business: '全部业务',
  channel: '全部渠道',
  merchant: '全部商家'
};

export const TIME_RANGE_OPTIONS: Array<{ label: string; value: DashboardTimeRange }> = [
  { label: '实时', value: 'realtime' },
  { label: '今日', value: 'today' },
  { label: '昨日', value: 'yesterday' },
  { label: '近 7 日', value: '7d' },
  { label: '近 30 日', value: '30d' }
];

export const REGION_OPTIONS = ['全部区域', '南山区', '福田区', '龙岗区', '宝安区'];
export const BUSINESS_OPTIONS = ['全部业务', '福利套餐', '普通团购', '超售套餐', '实物商品'];
export const CHANNEL_OPTIONS = ['全部渠道', '小程序首页', '搜索', '社群', '企微', '活动页面'];
export const MERCHANT_OPTIONS = [
  '全部商家',
  'XX 火锅',
  'XX 烧烤',
  'XX 茶饮',
  'XX 自助餐',
  'XX 烤肉'
];

const todayTrend: DashboardTrendPoint[] = [
  { label: '00:00', gmv: 4200, orders: 112, verify: 86, refund: 180, yesterdayGmv: 5100 },
  { label: '02:00', gmv: 2800, orders: 76, verify: 54, refund: 120, yesterdayGmv: 3300 },
  { label: '04:00', gmv: 1900, orders: 52, verify: 40, refund: 90, yesterdayGmv: 2100 },
  { label: '06:00', gmv: 3600, orders: 92, verify: 66, refund: 130, yesterdayGmv: 3500 },
  { label: '08:00', gmv: 9800, orders: 260, verify: 182, refund: 420, yesterdayGmv: 8600 },
  { label: '10:00', gmv: 16800, orders: 492, verify: 354, refund: 610, yesterdayGmv: 15400 },
  { label: '12:00', gmv: 24600, orders: 724, verify: 528, refund: 880, yesterdayGmv: 22800 },
  { label: '14:00', gmv: 21200, orders: 618, verify: 486, refund: 2680, yesterdayGmv: 24600 },
  { label: '16:00', gmv: 28400, orders: 840, verify: 676, refund: 1120, yesterdayGmv: 26200 },
  { label: '18:00', gmv: 36200, orders: 1048, verify: 840, refund: 1260, yesterdayGmv: 39400 },
  { label: '20:00', gmv: 42800, orders: 1280, verify: 990, refund: 1420, yesterdayGmv: 38600 },
  { label: '22:00', gmv: 34400, orders: 1030, verify: 798, refund: 980, yesterdayGmv: 33200 }
];

const sevenDayTrend: DashboardTrendPoint[] = [
  { label: '周一', gmv: 218400, orders: 6420, verify: 5140, refund: 7480, yesterdayGmv: 205200 },
  { label: '周二', gmv: 236800, orders: 6880, verify: 5520, refund: 8120, yesterdayGmv: 218400 },
  { label: '周三', gmv: 248600, orders: 7240, verify: 5800, refund: 8760, yesterdayGmv: 236800 },
  { label: '周四', gmv: 264200, orders: 7860, verify: 6280, refund: 9280, yesterdayGmv: 248600 },
  { label: '周五', gmv: 274800, orders: 8120, verify: 6500, refund: 10480, yesterdayGmv: 264200 },
  { label: '周六', gmv: 296200, orders: 8640, verify: 7040, refund: 11820, yesterdayGmv: 274800 },
  { label: '今日', gmv: 286420, orders: 8624, verify: 6927, refund: 12680, yesterdayGmv: 264720 }
];

const thirtyDayTrend: DashboardTrendPoint[] = [
  { label: '07/19', gmv: 228000, orders: 6820, verify: 5480, refund: 8660, yesterdayGmv: 214000 },
  { label: '07/24', gmv: 244000, orders: 7240, verify: 5820, refund: 9020, yesterdayGmv: 229000 },
  { label: '07/29', gmv: 258000, orders: 7560, verify: 6100, refund: 9680, yesterdayGmv: 242000 },
  { label: '08/03', gmv: 264000, orders: 7840, verify: 6300, refund: 10120, yesterdayGmv: 249000 },
  { label: '08/08', gmv: 278000, orders: 8220, verify: 6640, refund: 11200, yesterdayGmv: 261000 },
  { label: '08/13', gmv: 296000, orders: 8840, verify: 7140, refund: 12480, yesterdayGmv: 277000 },
  { label: '今日', gmv: 286420, orders: 8624, verify: 6927, refund: 12680, yesterdayGmv: 264720 }
];

export const DEMO_DASHBOARD_DATA: OperationsDashboardData = {
  title: '全域运营驾驶舱',
  updatedAt: '刚刚更新',
  kpis: [
    {
      key: 'gmv',
      label: 'GMV',
      value: 286420,
      format: 'currency',
      helper: '较昨日 +8.2%',
      secondary: '较上周同期 +12.4%',
      tone: 'blue',
      icon: 'coin'
    },
    {
      key: 'orders',
      label: '支付订单',
      value: 8624,
      format: 'count',
      helper: '较昨日 +6.4%',
      secondary: '客单价 ¥33.2',
      tone: 'teal',
      icon: 'orders'
    },
    {
      key: 'verify',
      label: '核销订单',
      value: 6927,
      format: 'count',
      helper: '核销率 80.3%',
      secondary: '较昨日 -1.4%',
      tone: 'green',
      icon: 'verify'
    },
    {
      key: 'dau',
      label: '活跃用户 DAU',
      value: 12860,
      format: 'count',
      helper: '较昨日 +3.1%',
      secondary: '7 日活跃 48,621',
      tone: 'purple',
      icon: 'users'
    },
    {
      key: 'new-users',
      label: '新增用户',
      value: 1286,
      format: 'count',
      helper: '新客占比 18.4%',
      secondary: '较昨日 +12.6%',
      tone: 'orange',
      icon: 'new-users'
    },
    {
      key: 'refund',
      label: '退款金额',
      value: 12680,
      format: 'currency',
      helper: '退款率 4.42%',
      secondary: '较昨日 +1.26%',
      tone: 'danger',
      icon: 'refund',
      risk: true
    }
  ],
  trendByRange: {
    realtime: todayTrend,
    today: todayTrend,
    yesterday: todayTrend.map((point) => ({
      ...point,
      gmv: point.yesterdayGmv,
      yesterdayGmv: point.gmv
    })),
    '7d': sevenDayTrend,
    '30d': thirtyDayTrend
  },
  funnel: [
    { label: '商品曝光', value: 326420, rate: 100, color: '#3b82f6' },
    { label: '商品访问', value: 80932, rate: 24.8, color: '#14b8a6' },
    { label: '提交订单', value: 11024, rate: 13.6, color: '#8b5cf6' },
    { label: '支付', value: 9074, rate: 82.3, color: '#f59e0b' },
    { label: '核销', value: 7360, rate: 81.1, color: '#ef6b5b' }
  ],
  breakdowns: {
    region: [
      { label: '南山区', value: 91654, share: 32, color: '#3b82f6' },
      { label: '福田区', value: 68741, share: 24, color: '#14b8a6' },
      { label: '龙岗区', value: 51556, share: 18, color: '#8b5cf6' },
      { label: '宝安区', value: 45827, share: 16, color: '#f59e0b' },
      { label: '其他', value: 28642, share: 10, color: '#cbd5e1' }
    ],
    category: [
      { label: '福利套餐', value: 100247, share: 35, color: '#3b82f6' },
      { label: '普通团购', value: 80200, share: 28, color: '#14b8a6' },
      { label: '超售套餐', value: 57284, share: 20, color: '#8b5cf6' },
      { label: '实物商品', value: 34370, share: 12, color: '#f59e0b' },
      { label: '其他', value: 14319, share: 5, color: '#cbd5e1' }
    ],
    channel: [
      { label: '小程序首页', value: 94400, share: 33, color: '#3b82f6' },
      { label: '搜索', value: 54420, share: 19, color: '#14b8a6' },
      { label: '社群', value: 51560, share: 18, color: '#8b5cf6' },
      { label: '企微', value: 42960, share: 15, color: '#f59e0b' },
      { label: '活动页面', value: 28640, share: 10, color: '#ef6b5b' },
      { label: '分享裂变', value: 14440, share: 5, color: '#cbd5e1' }
    ]
  },
  merchants: [
    {
      name: 'XX 火锅',
      area: '南山区',
      gmv: 28620,
      orders: 826,
      verifyRate: 86,
      refundRate: 2.1,
      health: '优秀'
    },
    {
      name: 'XX 烧烤',
      area: '福田区',
      gmv: 21320,
      orders: 624,
      verifyRate: 81,
      refundRate: 3.6,
      health: '正常'
    },
    {
      name: 'XX 茶饮',
      area: '龙岗区',
      gmv: 18820,
      orders: 920,
      verifyRate: 92,
      refundRate: 1.2,
      health: '优秀'
    },
    {
      name: 'XX 自助餐',
      area: '南山区',
      gmv: 16220,
      orders: 380,
      verifyRate: 72,
      refundRate: 9.8,
      health: '风险'
    },
    {
      name: 'XX 烤肉',
      area: '宝安区',
      gmv: 14860,
      orders: 426,
      verifyRate: 83,
      refundRate: 2.6,
      health: '正常'
    }
  ],
  packages: {
    hot: [
      {
        name: '火锅双人套餐',
        merchant: 'XX 火锅',
        gmv: 32680,
        sales: 820,
        conversion: 18.6,
        refundRate: 2.1
      },
      {
        name: '烧烤双人餐',
        merchant: 'XX 烧烤',
        gmv: 28420,
        sales: 720,
        conversion: 16.8,
        refundRate: 3.2
      },
      {
        name: '下午茶套餐',
        merchant: 'XX 茶饮',
        gmv: 19820,
        sales: 960,
        conversion: 22.1,
        refundRate: 1.1
      }
    ],
    growing: [
      {
        name: '南山晚餐组合',
        merchant: 'XX 火锅',
        gmv: 18420,
        sales: 420,
        conversion: 14.8,
        refundRate: 1.8
      },
      {
        name: '周末烤肉欢聚餐',
        merchant: 'XX 烤肉',
        gmv: 14260,
        sales: 360,
        conversion: 13.6,
        refundRate: 2.4
      },
      {
        name: '轻食午餐套餐',
        merchant: 'XX 茶饮',
        gmv: 12620,
        sales: 510,
        conversion: 15.4,
        refundRate: 1.6
      }
    ],
    risk: [
      {
        name: '火锅双人套餐',
        merchant: 'XX 火锅',
        gmv: 32680,
        sales: 820,
        conversion: 18.6,
        refundRate: 12.6
      },
      {
        name: '自助餐晚市券',
        merchant: 'XX 自助餐',
        gmv: 10220,
        sales: 280,
        conversion: 8.2,
        refundRate: 9.8
      },
      {
        name: '烧烤双人餐',
        merchant: 'XX 烧烤',
        gmv: 28420,
        sales: 720,
        conversion: 16.8,
        refundRate: 6.4
      }
    ],
    stock: [
      {
        name: '火锅套餐',
        merchant: 'XX 火锅',
        gmv: 8620,
        sales: 182,
        conversion: 12.4,
        refundRate: 2.1,
        remaining: 18,
        selloutMinutes: 42
      },
      {
        name: '南山晚餐组合',
        merchant: 'XX 火锅',
        gmv: 6420,
        sales: 126,
        conversion: 10.2,
        refundRate: 1.8,
        remaining: 28,
        selloutMinutes: 76
      },
      {
        name: '周末烤肉欢聚餐',
        merchant: 'XX 烤肉',
        gmv: 5260,
        sales: 92,
        conversion: 8.6,
        refundRate: 2.4,
        remaining: 36,
        selloutMinutes: 118
      }
    ]
  },
  users: {
    stats: [
      { label: '新用户', value: 1286, tone: 'orange' },
      { label: '活跃用户', value: 12860, tone: 'blue' },
      { label: '复购用户', value: 4260, tone: 'green' },
      { label: '沉睡用户', value: 38621, tone: 'purple' }
    ],
    lifecycle: [
      { label: '新用户', value: 12, share: 12, color: '#f59e0b' },
      { label: '成长期用户', value: 24, share: 24, color: '#3b82f6' },
      { label: '活跃用户', value: 31, share: 31, color: '#14b8a6' },
      { label: '高价值用户', value: 11, share: 11, color: '#8b5cf6' },
      { label: '沉睡用户', value: 22, share: 22, color: '#cbd5e1' }
    ],
    dormantHighValue: 8621,
    recallConversion: 7.2
  },
  community: {
    stats: [
      { label: '社群数', value: 286, format: 'count', tone: 'blue' },
      { label: '社群用户', value: 48621, format: 'count', tone: 'teal' },
      { label: '今日活跃', value: 12820, format: 'count', tone: 'purple' },
      { label: '社群 GMV', value: 86220, format: 'currency', tone: 'orange' }
    ],
    groups: [
      { name: '科技园福利群', gmv: 12680, activity: 92 },
      { name: '后海生活群', gmv: 10820, activity: 84 },
      { name: '西丽吃喝群', gmv: 8621, activity: 76 }
    ],
    bestSendTime: '17:40',
    bestSendReason: '科技园区域用户通常在 17:30–18:30 产生晚餐订单。'
  },
  alerts: [
    {
      id: 'refund-rate',
      level: 'high',
      title: 'XX 火锅退款率异常',
      metric: '今日退款率 12.6%',
      comparison: '7 日均值 4.2%',
      change: '↑ 200%',
      reason: '退款主要集中在 14:00 后购买的订单。',
      suggestion: '建议先检查晚餐时段的库存与套餐说明。',
      action: '查看详情'
    },
    {
      id: 'order-drop',
      level: 'medium',
      title: '科技园订单量下降',
      metric: '今日订单 862',
      comparison: '昨日同期 1,126',
      change: '-23.4%',
      reason: '17:00 后订单量低于近 7 日同期水平。',
      suggestion: '可以向科技园用户推送晚餐优惠套餐。',
      action: '创建活动'
    },
    {
      id: 'dinner-growth',
      level: 'opportunity',
      title: '南山区晚餐消费增长',
      metric: '17:00–19:00',
      comparison: 'GMV +32%',
      change: '机会',
      reason: '晚餐时段高意向用户集中，区域供给仍有提升空间。',
      suggestion: '可增加同类型商家的晚餐套餐曝光。',
      action: '查看推荐商家'
    }
  ]
};

export function cloneDashboardData(source = DEMO_DASHBOARD_DATA): OperationsDashboardData {
  return {
    ...source,
    kpis: source.kpis.map((item) => ({ ...item })),
    trendByRange: Object.fromEntries(
      Object.entries(source.trendByRange).map(([key, value]) => [
        key,
        value.map((item) => ({ ...item }))
      ])
    ) as Record<DashboardTimeRange, DashboardTrendPoint[]>,
    funnel: source.funnel.map((item) => ({ ...item })),
    breakdowns: Object.fromEntries(
      Object.entries(source.breakdowns).map(([key, value]) => [
        key,
        value.map((item) => ({ ...item }))
      ])
    ) as Record<DashboardCompositionTab, DashboardBreakdownItem[]>,
    merchants: source.merchants.map((item) => ({ ...item })),
    packages: Object.fromEntries(
      Object.entries(source.packages).map(([key, value]) => [
        key,
        value.map((item) => ({ ...item }))
      ])
    ) as Record<DashboardPackageTab, DashboardPackage[]>,
    users: {
      ...source.users,
      stats: source.users.stats.map((item) => ({ ...item })),
      lifecycle: source.users.lifecycle.map((item) => ({ ...item }))
    },
    community: {
      ...source.community,
      stats: source.community.stats.map((item) => ({ ...item })),
      groups: source.community.groups.map((item) => ({ ...item }))
    },
    alerts: source.alerts.map((item) => ({ ...item }))
  };
}
