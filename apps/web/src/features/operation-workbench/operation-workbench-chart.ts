import { buildDualAxisLine } from '../../utils/chart-options';
import { CHART_COLORS } from '../../utils/chart-theme';
import { readFen } from '../../utils/format';
import type { OperationTrendPoint } from '../../services/api/operation-workbench.api';

function trendGmvForChart(row: OperationTrendPoint): number {
  const fen = readFen(row, 'totalGmv');
  return fen === null ? 0 : Number(fen) / 100;
}

export function buildOperationTrendOption(trend: OperationTrendPoint[]) {
  if (trend.length === 0) return {};

  return buildDualAxisLine({
    categories: trend.map((point) => point.date.slice(5)),
    leftName: 'GMV',
    rightName: '支付订单',
    series: [
      {
        name: 'GMV',
        data: trend.map(trendGmvForChart),
        yAxisIndex: 0,
        color: CHART_COLORS.primary,
        area: true
      },
      {
        name: '支付订单',
        data: trend.map((point) => point.paidOrderCount),
        yAxisIndex: 1,
        color: CHART_COLORS.secondary
      }
    ]
  });
}
