import type { Ref } from 'vue';
import type { GmvDistributionRow, GmvKpi } from '../../../services/api/gmv.api';
import { getGmvDistribution } from '../../../services/api/gmv.api';
import type {
  GmvActivityRow,
  GmvAlertItem,
  GmvCategoryRow,
  GmvChannelRow,
  GmvFunnelStage,
  GmvHeatPoint
} from './gmv-cockpit-core';

const PALETTE = [
  '#2e90fa',
  '#16b79e',
  '#9e77ed',
  '#f79009',
  '#6172f3',
  '#0ba5ec',
  '#ee46bc',
  '#12b76a'
];

function colorAt(idx: number) {
  return PALETTE[idx % PALETTE.length];
}

/**
 * 品类：走 /gmv/distribution?dim=category。
 * Residual #289: keep synthetic 「其他」 long-tail so donut shares stay platform-total based;
 * only drop empty / 「未分类」 noise. Prefer server `share` (denom = platform totalGmv).
 */
export function mapCategoryRows(rows: GmvDistributionRow[]): GmvCategoryRow[] {
  const usable = rows.filter((r) => r.totalGmv > 0 && r.key && r.key !== '未分类');
  if (usable.length === 0) return [];
  // Prefer server share (already / platform total). Fallback re-base only if missing.
  const hasServerShare = usable.every(
    (r) => typeof r.share === 'number' && Number.isFinite(r.share)
  );
  const total = usable.reduce((s, r) => s + r.totalGmv, 0);
  return usable.map((r, idx) => ({
    name: r.key,
    value: r.totalGmv,
    share: hasServerShare ? r.share : total > 0 ? r.totalGmv / total : 0,
    color: colorAt(idx)
  }));
}

/**
 * 渠道：订单侧目前没有真实获客渠道维度（channel 固定 jeesite），
 * 用支付构成（现金 / 余额 / 福利金）作为可解释的拆分。
 */
export function mapPaymentChannelRows(kpi: GmvKpi | null): GmvChannelRow[] {
  if (!kpi) return [];
  const parts = [
    { name: '现金支付', value: Number(kpi.gmvOnline ?? 0), color: '#2e90fa' },
    { name: '余额支付', value: Number(kpi.gmvWallet ?? 0), color: '#16b79e' },
    { name: '积分抵现', value: Number(kpi.gmvBonus ?? 0), color: '#9e77ed' }
  ].filter((p) => p.value > 0);
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return [];
  return parts.map((p) => ({ ...p, share: p.value / total }));
}

/**
 * 转化漏斗：无曝光/点击链路时，用支付 → 核销 → 退款 的金额漏斗。
 * rate 相对上一阶段（支付=1，核销=verifyRate，退款=refundRate）。
 */
export function mapFunnelFromKpi(kpi: GmvKpi | null): GmvFunnelStage[] {
  if (!kpi || kpi.totalGmv <= 0) return [];
  const paid = Number(kpi.totalGmv);
  const verified = Number(kpi.totalVerify ?? 0);
  const refunded = Number(kpi.totalRefund ?? 0);
  return [
    { label: '支付', value: paid, rate: 1, color: '#2e90fa' },
    {
      label: '核销',
      value: verified,
      rate: Number(kpi.verifyRate ?? 0),
      color: '#16b79e'
    },
    {
      label: '退款',
      value: refunded,
      rate: Number(kpi.refundRate ?? 0),
      color: '#f79009'
    }
  ];
}

/** 区域/商家热力：把 distribution 映射到网格点 */
export function mapHeatFromAreas(rows: GmvDistributionRow[]): GmvHeatPoint[] {
  const usable = rows.filter(
    (r) => r.key && r.key !== '其他' && r.key !== '未分区' && r.totalGmv > 0
  );
  if (usable.length === 0) return [];
  const max = Math.max(...usable.map((r) => r.totalGmv));
  const cols = Math.min(5, Math.max(3, Math.ceil(Math.sqrt(usable.length))));
  return usable.map((r, idx) => {
    const intensity = max > 0 ? r.totalGmv / max : 0;
    return {
      name: r.key,
      value: [idx % cols, Math.floor(idx / cols), intensity] as [number, number, number]
    };
  });
}

/** 热力标题：区域分布优先，全未分区时回落到商家榜 */
export function heatCityLabel(rows: GmvDistributionRow[]): string {
  const usable = rows.filter(
    (r) => r.key && r.key !== '其他' && r.key !== '未分区' && r.totalGmv > 0
  );
  if (usable.length === 0) return '暂无';
  // 若 key 看起来像商家名（较长/含店/公司）则标为商家热力
  const merchantLike = usable.filter((r) => /店|公司|馆|中心|会|SPA|spa|堂|楼/.test(r.key)).length;
  if (merchantLike >= Math.ceil(usable.length / 2)) return '商家热力';
  return '区域分布';
}

function pct(ratio: number | null | undefined) {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  return Math.abs(ratio * 100).toFixed(2);
}

/** 异常预警：从 KPI 环比与阈值推导，不再用假数据 */
export function mapAlertsFromKpi(kpi: GmvKpi | null): GmvAlertItem[] {
  if (!kpi) return [];
  const alerts: GmvAlertItem[] = [];
  const cmp = kpi.compare ?? {};
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const gmvDelta = cmp.totalGmv;
  if (gmvDelta != null && gmvDelta <= -0.15) {
    alerts.push({
      id: 'gmv-down',
      region: '整体',
      title: `GMV较昨日下滑 ${pct(gmvDelta)}%`,
      time,
      tone: 'danger'
    });
  } else if (gmvDelta != null && gmvDelta <= -0.05) {
    alerts.push({
      id: 'gmv-soft',
      region: '整体',
      title: `GMV较昨日下滑 ${pct(gmvDelta)}%`,
      time,
      tone: 'warning'
    });
  }

  if (kpi.refundRate >= 0.05) {
    alerts.push({
      id: 'refund-high',
      region: '整体',
      title: `退款率偏高 ${(kpi.refundRate * 100).toFixed(2)}%`,
      time,
      tone: kpi.refundRate >= 0.08 ? 'danger' : 'warning'
    });
  } else if (cmp.refundRate != null && cmp.refundRate >= 0.3) {
    alerts.push({
      id: 'refund-up',
      region: '整体',
      title: `退款率较昨日升高 ${pct(cmp.refundRate)}%`,
      time,
      tone: 'warning'
    });
  }

  if (kpi.verifyRate > 0 && kpi.verifyRate < 0.8) {
    alerts.push({
      id: 'verify-low',
      region: '整体',
      title: `核销率偏低 ${(kpi.verifyRate * 100).toFixed(2)}%`,
      time,
      tone: 'info'
    });
  } else if (cmp.verifyRate != null && cmp.verifyRate <= -0.1) {
    alerts.push({
      id: 'verify-down',
      region: '整体',
      title: `核销率较昨日下降 ${pct(cmp.verifyRate)}%`,
      time,
      tone: 'info'
    });
  }

  return alerts.slice(0, 5);
}

export async function loadGmvCockpitExtras(params: {
  kpi: Ref<GmvKpi | null>;
  categories: Ref<GmvCategoryRow[]>;
  channels: Ref<GmvChannelRow[]>;
  funnel: Ref<GmvFunnelStage[]>;
  activities: Ref<GmvActivityRow[]>;
  heatPoints: Ref<GmvHeatPoint[]>;
  heatCity: Ref<string>;
  alerts: Ref<GmvAlertItem[]>;
}) {
  const kpi = params.kpi.value;

  // 品类 + 区域并行；失败时各自降级为空，不阻断整页
  // Residual #289: distribution returns { items, limit, matched, truncated }.
  const empty: GmvDistributionRow[] = [];
  const [categoryPayload, areaPayload] = await Promise.all([
    getGmvDistribution('category', 8, true).catch(() => null),
    getGmvDistribution('area', 20, true).catch(() => null)
  ]);
  const categoryRows = categoryPayload?.items ?? empty;
  const areaRows = areaPayload?.items ?? empty;

  params.categories.value = mapCategoryRows(categoryRows);
  params.channels.value = mapPaymentChannelRows(kpi);
  params.funnel.value = mapFunnelFromKpi(kpi);
  // 活动效果暂无后端数据源，保持空态，避免假数据误导
  params.activities.value = [];
  params.heatPoints.value = mapHeatFromAreas(areaRows);
  params.heatCity.value = heatCityLabel(areaRows);
  params.alerts.value = mapAlertsFromKpi(kpi);
}
