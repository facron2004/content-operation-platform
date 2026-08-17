import { shiftDateKey } from '@content/shared';
import type {
  CommunityListResponse,
  ConsoleResponse,
  OperationCard,
  OperationAlert
} from '@content/shared';
import type { ContentFunnelSummary } from './composables/dashboard-summary';
import type {
  GmvDistributionRow,
  GmvMerchantRow,
  GmvTrendPoint,
} from '../../services/api/gmv.api';
import type {
  OperationGmvKpi,
  OperationTrendPoint,
  OperationWorkbenchResponse
} from '../../services/api/operation-workbench.api';
import type { UserLifecycleResponse, UserLifecycleStageKey } from '../../services/api/user-lifecycle.api';
import {
  createEmptyDashboardData,
  type DashboardAlert,
  type DashboardBreakdownItem,
  type DashboardCompositionTab,
  type DashboardFunnelStage,
  type DashboardKpi,
  type DashboardMerchant,
  type DashboardPackage,
  type DashboardTrendPoint,
  type OperationsDashboardData
} from './operations-dashboard';

export interface DashboardDataSources {
  workbench: OperationWorkbenchResponse | null;
  console: ConsoleResponse | null;
  trend: GmvTrendPoint[];
  distributions: Partial<Record<DashboardCompositionTab, GmvDistributionRow[]>>;
  merchants: GmvMerchantRow[];
  funnel: ContentFunnelSummary | null;
  lifecycle: UserLifecycleResponse | null;
  communities: CommunityListResponse | null;
}

const CHART_COLORS = ['#3b82f6', '#14b8a6', '#8b5cf6', '#f59e0b', '#ef6b5b', '#cbd5e1'];

const LIFECYCLE_COLORS: Record<UserLifecycleStageKey, string> = {
  prospect: '#cbd5e1',
  new: '#f59e0b',
  active: '#14b8a6',
  at_risk: '#ef6b5b',
  churned: '#94a3b8'
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  continuous_unsold: '连续未售',
  abnormal_sold_out: '异常售罄',
  high_refund: '高退款',
  low_verify: '低核销',
  missing_use_rules: '缺少使用规则',
  missing_selling_points: '缺少卖点',
  inventory_abnormal: '库存异常',
  price_abnormal: '价格异常',
  merchant_abnormal: '商家异常'
};

function numeric(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function moneyFromFenOrYuan(fen: unknown, yuan: unknown): number {
  if (fen !== null && fen !== undefined && fen !== '') {
    const value = Number(fen);
    if (Number.isFinite(value)) return value / 100;
  }
  return numeric(yuan);
}

function percentage(value: unknown): number {
  const result = numeric(value);
  return Math.round((Math.abs(result) <= 1 ? result * 100 : result) * 10) / 10;
}

function count(value: unknown): number {
  return Math.max(0, Math.round(numeric(value)));
}

function percentText(value: unknown): string {
  return `${percentage(value)}%`;
}

function compareText(value: unknown, fallback: string): string {
  const delta = optionalNumber(value);
  if (delta === undefined) return fallback;
  return `较昨日 ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`;
}

function mapKpis(
  gmv: OperationGmvKpi | undefined,
  lifecycle: UserLifecycleResponse | null
): DashboardKpi[] {
  const kpis: DashboardKpi[] = [];
  if (gmv) {
    const orders = count(gmv.paidOrderCount);
    const verifyOrders = count(
      gmv.verifyOrderCount ?? Math.round(orders * numeric(gmv.verifyRate))
    );
    const refund = moneyFromFenOrYuan(gmv.totalRefundFen, gmv.totalRefund);
    const refundRate = numeric(gmv.refundRate);
    kpis.push(
      {
        key: 'gmv',
        label: 'GMV',
        value: moneyFromFenOrYuan(gmv.totalGmvFen, gmv.totalGmv),
        format: 'currency',
        helper: compareText(gmv.compare?.totalGmv, '当日经营快照'),
        secondary: gmv.avgOrderValue > 0 ? `客单价 ¥${gmv.avgOrderValue.toFixed(2)}` : gmv.dataSource,
        tone: 'blue',
        icon: 'coin'
      },
      {
        key: 'orders',
        label: '支付订单',
        value: orders,
        format: 'count',
        helper: compareText(gmv.compare?.paidOrderCount, '当日经营快照'),
        secondary: gmv.avgOrderValue > 0 ? `客单价 ¥${gmv.avgOrderValue.toFixed(2)}` : gmv.dataSource,
        tone: 'teal',
        icon: 'orders'
      },
      {
        key: 'verify',
        label: '核销订单',
        value: verifyOrders,
        format: 'count',
        helper: `核销率 ${percentText(gmv.verifyRate)}`,
        secondary: compareText(gmv.compare?.verifyRate, `数据源 ${gmv.dataSource}`),
        tone: 'green',
        icon: 'verify'
      },
      {
        key: 'refund',
        label: '退款金额',
        value: refund,
        format: 'currency',
        helper: `退款率 ${percentText(refundRate)}`,
        secondary:
          gmv.refundOrderCount === undefined
            ? `数据源 ${gmv.dataSource}`
            : `退款订单 ${count(gmv.refundOrderCount).toLocaleString('zh-CN')}`,
        tone: 'danger',
        icon: 'refund',
        risk: refundRate >= 0.05
      }
    );
  }

  if (lifecycle) {
    const newUsers = lifecycle.stages.find((stage) => stage.key === 'new')?.memberCount ?? 0;
    const dormantUsers = lifecycle.summary.atRiskMembers + lifecycle.summary.churnedMembers;
    kpis.push(
      {
        key: 'active-users',
        label: '近30日活跃用户',
        value: count(lifecycle.summary.activeMembers30d),
        format: 'count',
        helper: '用户生命周期汇总',
        secondary: `总用户 ${count(lifecycle.summary.totalMembers).toLocaleString('zh-CN')}`,
        tone: 'purple',
        icon: 'users'
      },
      {
        key: 'new-users',
        label: '新用户',
        value: count(newUsers),
        format: 'count',
        helper: '生命周期阶段：新用户',
        secondary: `已付费 ${count(lifecycle.summary.paidMembers).toLocaleString('zh-CN')}`,
        tone: 'orange',
        icon: 'new-users'
      },
      {
        key: 'dormant-users',
        label: '沉睡/流失用户',
        value: count(dormantUsers),
        format: 'count',
        helper: '生命周期预警阶段汇总',
        secondary: `风险 ${count(lifecycle.summary.atRiskMembers).toLocaleString('zh-CN')} · 流失 ${count(lifecycle.summary.churnedMembers).toLocaleString('zh-CN')}`,
        tone: 'purple',
        icon: 'users'
      }
    );
  }

  return kpis;
}

type RawTrendPoint = GmvTrendPoint | OperationTrendPoint;

function mapTrendPoint(
  point: RawTrendPoint,
  pointsByDate: Map<string, RawTrendPoint>,
  currentDate: string | undefined,
  labelOverride?: string
): DashboardTrendPoint {
  const orders = count(point.paidOrderCount);
  const verifyRate = numeric(point.verifyRate);
  const verify = count(point.verifyCount ?? Math.round(orders * verifyRate));
  const previous = pointsByDate.get(shiftDateKey(point.date, -1));
  return {
    label: labelOverride ?? (point.date === currentDate ? '今日' : point.date.slice(5)),
    gmv: moneyFromFenOrYuan(point.totalGmvFen, point.totalGmv),
    orders,
    verify,
    refund: moneyFromFenOrYuan(point.totalRefundFen, point.totalRefund),
    yesterdayGmv: previous
      ? moneyFromFenOrYuan(previous.totalGmvFen, previous.totalGmv)
      : undefined
  };
}

function mapTrendRanges(
  workbench: OperationWorkbenchResponse | null,
  trend: GmvTrendPoint[]
): OperationsDashboardData['trendByRange'] {
  const pointsByDate = new Map<string, RawTrendPoint>();
  for (const point of workbench?.trend ?? []) pointsByDate.set(point.date, point);
  for (const point of trend) pointsByDate.set(point.date, point);

  const dates = [...pointsByDate.keys()].sort();
  const currentDate = workbench?.date ?? dates[dates.length - 1];
  const mappedByDate = new Map(
    dates.map((date) => [date, mapTrendPoint(pointsByDate.get(date)!, pointsByDate, currentDate)])
  );
  const current = currentDate ? mappedByDate.get(currentDate) : undefined;
  const yesterdayDate = currentDate ? shiftDateKey(currentDate, -1) : undefined;
  const yesterday = yesterdayDate ? mappedByDate.get(yesterdayDate) : undefined;
  const workbenchTrend = (workbench?.trend ?? [])
    .map((point) => mappedByDate.get(point.date))
    .filter((point): point is DashboardTrendPoint => Boolean(point));
  const thirtyDayTrend = dates
    .map((date) => mappedByDate.get(date))
    .filter((point): point is DashboardTrendPoint => Boolean(point));

  return {
    realtime: current ? [mapTrendPoint(pointsByDate.get(currentDate!)!, pointsByDate, currentDate, '实时')] : [],
    today: current ? [mapTrendPoint(pointsByDate.get(currentDate!)!, pointsByDate, currentDate, '今日')] : [],
    yesterday: yesterday
      ? [mapTrendPoint(pointsByDate.get(yesterdayDate!)!, pointsByDate, currentDate, '昨日')]
      : [],
    '7d': workbenchTrend.length ? workbenchTrend : thirtyDayTrend.slice(-7),
    '30d': thirtyDayTrend
  };
}

function mapFunnel(source: ContentFunnelSummary | null): DashboardFunnelStage[] {
  if (!source) return [];
  return [
    { label: '内容点击', value: count(source.totalClickCount), rate: 100, color: '#3b82f6' },
    {
      label: '支付订单',
      value: count(source.totalOrderCount),
      rate: percentage(source.contentConversionRate),
      color: '#14b8a6'
    },
    {
      label: '核销订单',
      value: count(source.totalVerifyCount),
      rate: percentage(source.verifyConversionRate),
      color: '#8b5cf6'
    }
  ];
}

function mapBreakdown(rows: GmvDistributionRow[] | undefined): DashboardBreakdownItem[] {
  return (rows ?? []).map((row, index) => ({
    label: row.key,
    value: moneyFromFenOrYuan(row.totalGmvFen, row.totalGmv),
    share: percentage(row.share),
    color: CHART_COLORS[index % CHART_COLORS.length]
  }));
}

function mapMerchants(rows: GmvMerchantRow[]): DashboardMerchant[] {
  return rows.map((row) => {
    const refundRate = percentage(row.refundRate);
    const verifyRate = percentage(row.verifyRate);
    return {
      name: row.merchantName,
      area: row.areaName || '未标注区域',
      gmv: moneyFromFenOrYuan(row.gmvFen, row.gmv),
      orders: count(row.paidOrderCount),
      verifyRate,
      refundRate,
      health: refundRate >= 10 || verifyRate < 60 ? '风险' : refundRate <= 3 && verifyRate >= 80 ? '优秀' : '正常'
    };
  });
}

function mapPackage(card: OperationCard): DashboardPackage {
  return {
    id: card.packageId,
    name: card.packageName,
    merchant: card.merchantName,
    area: card.areaName,
    price: numeric(card.currentPrice),
    stockLeft: count(card.stockLeft),
    score: numeric(card.score),
    tags: card.tags.map((tag) => tag.label),
    reason: card.reason,
    nextAction: card.nextAction
  };
}

function mapPackages(cards: OperationCard[] | undefined): DashboardPackage[] {
  return (cards ?? []).map(mapPackage);
}

function mapUsers(source: UserLifecycleResponse | null) {
  if (!source) return createEmptyDashboardData().users;
  const dormantUsers = source.summary.atRiskMembers + source.summary.churnedMembers;
  return {
    stats: [
      { label: '新用户', value: count(source.stages.find((stage) => stage.key === 'new')?.memberCount), tone: 'orange' },
      { label: '近30日活跃', value: count(source.summary.activeMembers30d), tone: 'blue' },
      { label: '已付费用户', value: count(source.summary.paidMembers), tone: 'green' },
      { label: '沉睡/流失', value: count(dormantUsers), tone: 'purple' }
    ],
    lifecycle: source.stages.map((stage, index) => ({
      label: stage.label,
      value: count(stage.memberCount),
      share: percentage(stage.percentage),
      color: LIFECYCLE_COLORS[stage.key] ?? CHART_COLORS[index % CHART_COLORS.length]
    })),
    dormantUsers: count(dormantUsers)
  };
}

function activityLabel(value: string): string {
  return value === 'high' ? '高活跃' : value === 'medium' ? '中活跃' : '低活跃';
}

function mapCommunity(
  source: CommunityListResponse | null,
  console: ConsoleResponse | null
) {
  if (!source && !console) return createEmptyDashboardData().community;
  const groups = (source?.items ?? []).slice(0, 3).map((group) => ({
    name: group.groupName,
    memberCount: count(group.memberCount),
    activity: activityLabel(group.activityLevel)
  }));
  const stats = source
    ? [
        { label: '社群数', value: count(source.total), format: 'count' as const, tone: 'blue' },
        {
          label: '当前页成员',
          value: source.items.reduce((total, group) => total + count(group.memberCount), 0),
          format: 'count' as const,
          tone: 'teal'
        },
        {
          label: '高活跃社群',
          value: source.items.filter((group) => group.activityLevel === 'high').length,
          format: 'count' as const,
          tone: 'purple'
        }
      ]
    : [];
  if (console) {
    stats.push({
      label: '今日社群任务',
      value: count(console.summary.communityTaskCount),
      format: 'count' as const,
      tone: 'orange'
    });
  }
  const task = console?.communityTasks[0];
  return {
    stats,
    groups,
    bestSendTime: task?.plannedTime || '-',
    bestSendReason: task?.reason || '暂无待执行社群任务'
  };
}

function mapAlert(alert: OperationAlert): DashboardAlert {
  return {
    id: alert.alertId,
    packageId: alert.packageId,
    level: alert.level === 'danger' ? 'high' : alert.level === 'warning' ? 'medium' : 'opportunity',
    title: alert.title,
    metric: `${alert.merchantName} · ${alert.packageName}`,
    comparison: `${alert.areaName || '未标注区域'} · ${ALERT_TYPE_LABELS[alert.type] ?? alert.type}`,
    reason: alert.reason,
    action: alert.action || '查看预警'
  };
}

function mapAlerts(alerts: OperationAlert[] | undefined): DashboardAlert[] {
  return (alerts ?? []).map(mapAlert);
}

export function mapDashboardSources(sources: DashboardDataSources): OperationsDashboardData {
  const data = createEmptyDashboardData();
  data.updatedAt = sources.workbench?.updatedAt ?? sources.console?.summary.updatedAt ?? '';
  data.kpis = mapKpis(sources.workbench?.kpis?.gmv, sources.lifecycle);
  data.trendByRange = mapTrendRanges(sources.workbench, sources.trend);
  data.funnel = mapFunnel(sources.funnel);
  data.breakdowns = {
    region: mapBreakdown(sources.distributions.region),
    category: mapBreakdown(sources.distributions.category),
    channel: mapBreakdown(sources.distributions.channel)
  };
  data.merchants = mapMerchants(sources.merchants);
  data.packages = {
    hot: mapPackages(sources.console?.hotOpportunities),
    growing: mapPackages(sources.console?.mustPushPackages),
    risk: mapPackages(sources.console?.riskPackages),
    stock: mapPackages(sources.console?.slowMovingPackages)
  };
  data.users = mapUsers(sources.lifecycle);
  data.community = mapCommunity(sources.communities, sources.console);
  data.alerts = mapAlerts(sources.console?.alerts);
  return data;
}
