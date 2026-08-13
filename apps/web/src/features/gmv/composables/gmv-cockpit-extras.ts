import type { Ref } from 'vue';
import type { GmvDistributionRow, GmvKpi } from '../../../services/api/gmv.api';
import { getGmvDistribution } from '../../../services/api/gmv.api';
import { extractErrorMessage } from '../../../services/http-client';
import { readFen, sumMoneyFen } from '../../../utils/format';
import type {
  GmvAlertItem,
  GmvCategoryRow,
  GmvChannelRow,
  GmvFunnelStage,
  GmvRequestGuard
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
 *
 * VNext §7.4.5：品类金额求和改用整数分（sumMoneyFen），占比用 fen 比值，消除浮点累积误差。
 */
export function mapCategoryRows(rows: GmvDistributionRow[]): GmvCategoryRow[] {
  // Signed net GMV is meaningful: a fully-refunded or over-refunded category
  // must remain visible in the legend, as must the explicit 「未分类」 bucket.
  const usable = rows.filter((r) => Boolean(r.key?.trim()));
  if (usable.length === 0) return [];
  // Prefer server share (already / platform total). Fallback re-base only if missing.
  const hasServerShare = usable.every(
    (r) => typeof r.share === 'number' && Number.isFinite(r.share)
  );
  const totalFen = sumMoneyFen(usable, 'totalGmv');
  return usable.map((r, idx) => {
    const valueFen = readFen(r, 'totalGmv') ?? 0n;
    return {
      name: r.key,
      value: Number(valueFen) / 100,
      share: hasServerShare ? r.share : totalFen !== 0n ? Number(valueFen) / Number(totalFen) : 0,
      color: valueFen < 0n ? '#d92d20' : colorAt(idx)
    };
  });
}

/**
 * 渠道：订单侧目前没有真实获客渠道维度（channel 固定 jeesite），
 * 用净 GMV 的支付构成（现金 / 余额 / 积分）作为可对账拆分。
 */
export function mapPaymentChannelRows(kpi: GmvKpi | null): GmvChannelRow[] {
  if (!kpi) return [];
  const parts = [
    { name: '现金支付', value: Number(readFen(kpi, 'gmvOnline') ?? 0) / 100, color: '#2e90fa' },
    { name: '余额支付', value: Number(readFen(kpi, 'gmvWallet') ?? 0) / 100, color: '#16b79e' },
    { name: '积分支付', value: Number(readFen(kpi, 'gmvBonus') ?? 0) / 100, color: '#9e77ed' }
  ].filter((p) => p.value > 0);
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return [];
  return parts.map((p) => ({ ...p, share: p.value / total }));
}

/**
 * 履约与退款：展示金额及订单率，两者不是逐级转化，不能称为漏斗。
 */
export function mapFunnelFromKpi(kpi: GmvKpi | null): GmvFunnelStage[] {
  if (!kpi || (readFen(kpi, 'totalGmv') ?? 0n) <= 0n) return [];
  const paid = Number(readFen(kpi, 'totalGmv') ?? 0) / 100;
  const verified = Number(readFen(kpi, 'totalVerify') ?? 0) / 100;
  const refunded = Number(readFen(kpi, 'totalRefund') ?? 0) / 100;
  return [
    { label: '净 GMV', value: paid, rate: 1, rateLabel: '基准', color: '#2e90fa' },
    {
      label: '核销金额',
      value: verified,
      rate: Number(kpi.verifyRate ?? 0),
      rateLabel: '核销单率',
      color: '#16b79e'
    },
    {
      label: '退款金额',
      value: refunded,
      rate: Number(kpi.refundRate ?? 0),
      rateLabel: '退款单率',
      color: '#f79009'
    }
  ];
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
  const sourceTime = kpi.updatedAt ? new Date(kpi.updatedAt) : null;
  const time =
    sourceTime && !Number.isNaN(sourceTime.getTime())
      ? `${String(sourceTime.getHours()).padStart(2, '0')}:${String(sourceTime.getMinutes()).padStart(2, '0')}`
      : '';

  const gmvDelta = cmp.totalGmv;
  if (gmvDelta != null && gmvDelta <= -0.15) {
    alerts.push({
      id: 'gmv-down',
      region: '整体',
      title: `净 GMV 较昨日下滑 ${pct(gmvDelta)}%`,
      time,
      tone: 'danger'
    });
  } else if (gmvDelta != null && gmvDelta <= -0.05) {
    alerts.push({
      id: 'gmv-soft',
      region: '整体',
      title: `净 GMV 较昨日下滑 ${pct(gmvDelta)}%`,
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
  date: string;
  kpi: Ref<GmvKpi | null>;
  extrasError: Ref<string | null>;
  categories: Ref<GmvCategoryRow[]>;
  channels: Ref<GmvChannelRow[]>;
  funnel: Ref<GmvFunnelStage[]>;
  alerts: Ref<GmvAlertItem[]>;
  isCurrent?: GmvRequestGuard;
}) {
  const isCurrent = params.isCurrent ?? (() => true);
  const kpi = params.kpi.value;

  // 品类辅助图表失败不阻断主看板，但必须显式可见。
  // Residual #289: distribution returns { items, limit, matched, truncated }.
  const empty: GmvDistributionRow[] = [];
  const categoryResult = await getGmvDistribution('category', 8, true, params.date).then(
    (payload) => ({ payload, error: null as unknown }),
    (error: unknown) => ({ payload: null, error })
  );
  if (!isCurrent()) return;

  const errors: string[] = [];
  if (categoryResult.error) {
    errors.push(`品类分布：${extractErrorMessage(categoryResult.error, '加载品类分布失败')}`);
  } else {
    const categoryPayload = categoryResult.payload;
    params.categories.value = mapCategoryRows(categoryPayload?.items ?? empty);
  }
  params.extrasError.value = errors.length > 0 ? errors.join('；') : null;

  params.channels.value = mapPaymentChannelRows(kpi);
  params.funnel.value = mapFunnelFromKpi(kpi);
  params.alerts.value = mapAlertsFromKpi(kpi);
}
