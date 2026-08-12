import type { EChartsCoreOption } from 'echarts/core';
import { buildCategoryBar, buildDualAxisLine } from '../../../utils/chart-options';
import { CHART_COLORS, CHART_TOOLTIP } from '../../../utils/chart-theme';
import type {
  LabeledAmount,
  WelfarePointDailyTrendPoint,
  WelfarePointTopMember
} from '../../../services/api/welfare-points.api';

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 每日趋势：充值(左轴, 面积) + 消费(右轴)。 */
export function buildTrendOption(trend: WelfarePointDailyTrendPoint[]): EChartsCoreOption {
  if (trend.length === 0) return {};
  return buildDualAxisLine({
    categories: trend.map((p) => p.date.slice(5)),
    leftName: '充值',
    rightName: '消费',
    series: [
      {
        name: '充值',
        data: trend.map((p) => p.recharge),
        yAxisIndex: 0,
        color: CHART_COLORS.primary,
        area: true
      },
      {
        name: '消费',
        data: trend.map((p) => p.consume),
        yAxisIndex: 1,
        color: CHART_COLORS.danger
      }
    ]
  });
}

/** 变动类型分布：充值 vs 消费（环形）。 */
export function buildTypeDonutOption(byType: LabeledAmount[]): EChartsCoreOption {
  if (byType.length === 0) return {};
  const colors: Record<string, string> = { '1': CHART_COLORS.primary, '2': CHART_COLORS.danger };
  return {
    tooltip: { ...CHART_TOOLTIP.item, formatter: (p: { name: string; value: number; percent?: number }) => `${p.name}<br/>${fmt(p.value)}（${p.percent?.toFixed(1)}%）` },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 6, icon: 'roundRect', textStyle: { color: '#6e6e73', fontSize: 11 } },
    series: [
      {
        type: 'pie',
        radius: ['46%', '72%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        label: { show: true, formatter: '{b}\n{d}%', color: '#1d1d1f', fontSize: 11 },
        data: byType.map((t) => ({
          name: t.label,
          value: t.amount,
          itemStyle: { color: colors[String(t.key)] ?? CHART_COLORS.secondary }
        }))
      }
    ]
  };
}

/** 来源分布（柱状，按金额）。 */
export function buildSourceBarOption(bySource: LabeledAmount[]): EChartsCoreOption {
  if (bySource.length === 0) return {};
  const items = [...bySource]
    .sort((a, b) => b.amount - a.amount)
    .map((s) => ({
      label: s.label,
      value: s.amount,
      key: String(s.key),
      color: CHART_COLORS.secondary,
      extra: { 笔数: s.count }
    }));
  return buildCategoryBar({ items, yName: '金额', showShare: true, rotate: 20, barMaxWidth: 26 });
}

/** Top 会员：按净变动(充值-消费) 排序的柱状。 */
export function buildTopMembersOption(topMembers: WelfarePointTopMember[]): EChartsCoreOption {
  if (topMembers.length === 0) return {};
  const items = topMembers
    .slice()
    .sort((a, b) => b.net - a.net)
    .map((m) => ({
      label: m.memberName || m.memberPhone || m.memberCode || m.centerMemberId.slice(-6),
      value: m.net,
      key: m.centerMemberId,
      color: m.net >= 0 ? CHART_COLORS.success : CHART_COLORS.danger,
      extra: { 充值: fmt(m.recharge), 消费: fmt(m.consume), 余额: fmt(m.lastBalance) }
    }));
  return buildCategoryBar({ items, yName: '净变动', showShare: false, rotate: 24, barMaxWidth: 24 });
}
