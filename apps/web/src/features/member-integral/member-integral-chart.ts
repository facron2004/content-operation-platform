import type { EChartsCoreOption } from 'echarts/core';
import { buildCategoryBar, buildDualAxisLine } from '../../utils/chart-options';
import { CHART_COLORS, CHART_TOOLTIP } from '../../utils/chart-theme';
import type {
  LabeledAmount,
  MemberIntegralDailyTrendPoint,
  MemberIntegralTopMember
} from '../../services/api/member-integral.api';

const fmt = (n: number) =>
  (Math.round(n * 100) / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

/** 颜色循环：积分类型/状态都是数值代码，没有固定语义，按出现顺序着色。 */
const DONUT_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.purple,
  CHART_COLORS.danger,
  CHART_COLORS.muted
];

/** 每日趋势：增加(左轴, 面积) + 消耗(右轴)。 */
export function buildTrendOption(trend: MemberIntegralDailyTrendPoint[]): EChartsCoreOption {
  if (trend.length === 0) return {};
  return buildDualAxisLine({
    categories: trend.map((p) => p.date.slice(5)),
    leftName: '增加',
    rightName: '消耗',
    series: [
      {
        name: '增加',
        data: trend.map((p) => p.gain),
        yAxisIndex: 0,
        color: CHART_COLORS.primary,
        area: true
      },
      {
        name: '消耗',
        data: trend.map((p) => p.consume),
        yAxisIndex: 1,
        color: CHART_COLORS.danger
      }
    ]
  });
}

/** 积分类型分布（环形）。 */
export function buildTypeDonutOption(byType: LabeledAmount[]): EChartsCoreOption {
  if (byType.length === 0) return {};
  return {
    tooltip: {
      ...CHART_TOOLTIP.item,
      formatter: (p: { name: string; value: number; percent?: number }) =>
        `${p.name}<br/>${fmt(p.value)}（${p.percent?.toFixed(1)}%）`
    },
    legend: {
      bottom: 0,
      itemWidth: 10,
      itemHeight: 6,
      icon: 'roundRect',
      textStyle: { color: '#6e6e73', fontSize: 11 }
    },
    series: [
      {
        type: 'pie',
        radius: ['46%', '72%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        label: { show: true, formatter: '{b}\n{d}%', color: '#1d1d1f', fontSize: 11 },
        data: byType.map((t, i) => ({
          name: t.label,
          value: t.amount,
          itemStyle: { color: DONUT_COLORS[i % DONUT_COLORS.length] }
        }))
      }
    ]
  };
}

/** 状态分布（柱状，按变动量）。 */
export function buildStateBarOption(byState: LabeledAmount[]): EChartsCoreOption {
  if (byState.length === 0) return {};
  const items = [...byState]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .map((s) => ({
      label: s.label,
      value: s.amount,
      key: String(s.key),
      color: s.amount >= 0 ? CHART_COLORS.secondary : CHART_COLORS.danger,
      extra: { 笔数: s.count }
    }));
  return buildCategoryBar({ items, yName: '积分', showShare: true, rotate: 20, barMaxWidth: 26 });
}

/** Top 会员：按净变动排序的柱状。 */
export function buildTopMembersOption(topMembers: MemberIntegralTopMember[]): EChartsCoreOption {
  if (topMembers.length === 0) return {};
  const items = topMembers
    .slice()
    .sort((a, b) => b.net - a.net)
    .map((m) => ({
      label: m.memberName || m.memberPhone || m.memberCode || m.centerMemberId.slice(-6),
      value: m.net,
      key: m.centerMemberId,
      color: m.net >= 0 ? CHART_COLORS.success : CHART_COLORS.danger,
      extra: { 增加: fmt(m.gain), 消耗: fmt(m.consume), 记录数: m.recordCount }
    }));
  return buildCategoryBar({ items, yName: '净变动', showShare: false, rotate: 24, barMaxWidth: 24 });
}
