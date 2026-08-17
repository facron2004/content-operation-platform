export type DashboardTimeRange = 'realtime' | 'today' | 'yesterday' | '7d' | '30d';
export type DashboardCompositionTab = 'region' | 'category' | 'channel';
export type DashboardPackageTab = 'hot' | 'growing' | 'risk' | 'stock';
export type DashboardTrendMetric = 'gmv' | 'orders' | 'verify' | 'refund';

export interface DashboardFilters {
  timeRange: DashboardTimeRange;
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
  yesterdayGmv?: number;
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
  id: string;
  name: string;
  merchant: string;
  area: string;
  price: number;
  stockLeft: number;
  score: number;
  tags: string[];
  reason: string;
  nextAction: string;
}

export interface DashboardUserData {
  stats: Array<{ label: string; value: number; tone: string }>;
  lifecycle: DashboardBreakdownItem[];
  dormantUsers: number;
}

export interface DashboardCommunityData {
  stats: Array<{ label: string; value: number; format: 'count'; tone: string }>;
  groups: Array<{ name: string; memberCount: number; activity: string }>;
  bestSendTime: string;
  bestSendReason: string;
}

export interface DashboardAlert {
  id: string;
  packageId: string;
  level: 'high' | 'medium' | 'opportunity';
  title: string;
  metric: string;
  comparison: string;
  reason: string;
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
  timeRange: 'today'
};

export const TIME_RANGE_OPTIONS: Array<{ label: string; value: DashboardTimeRange }> = [
  { label: '实时快照', value: 'realtime' },
  { label: '今日', value: 'today' },
  { label: '昨日', value: 'yesterday' },
  { label: '近 7 日', value: '7d' },
  { label: '近 30 日', value: '30d' }
];

/** Empty state used before/when real APIs return no data. It contains no sample values. */
export function createEmptyDashboardData(): OperationsDashboardData {
  return {
    title: '全域运营驾驶舱',
    updatedAt: '',
    kpis: [],
    trendByRange: {
      realtime: [],
      today: [],
      yesterday: [],
      '7d': [],
      '30d': []
    },
    funnel: [],
    breakdowns: {
      region: [],
      category: [],
      channel: []
    },
    merchants: [],
    packages: {
      hot: [],
      growing: [],
      risk: [],
      stock: []
    },
    users: {
      stats: [],
      lifecycle: [],
      dormantUsers: 0
    },
    community: {
      stats: [],
      groups: [],
      bestSendTime: '-',
      bestSendReason: '暂无待执行社群任务'
    },
    alerts: []
  };
}
