import { computed, type Ref } from 'vue';
import type {
  MerchantSalesRanking,
  MerchantSalesSort,
  MerchantSalesSummary,
  MerchantSalesTrendPoint,
  MerchantSalesWindow
} from '../../../services/api/merchant-sales.api';
import {
  displayMoney,
  formatNumber,
  formatPercent,
  rateClass,
  rateClassInv,
  readFen
} from '../../../utils/format';
import {
  type createMerchantSalesState,
  exportMerchantSales,
  forceRefreshAndReload,
  loadMerchantSalesRanking,
  reloadMerchantSales
} from './merchant-sales-core';

type MerchantSalesState = ReturnType<typeof createMerchantSalesState>;

export function merchantSalesRowClass(row: {
  refundRate: number;
  verifyRate: number;
  gmv: number;
}): string {
  if (row.gmv <= 0) return '';
  if (row.refundRate >= 0.1) return 'is-danger';
  if (row.refundRate >= 0.05) return 'is-warning';
  if (row.verifyRate > 0 && row.verifyRate < 0.3) return 'is-danger';
  return '';
}

function buildMerchantSalesTrendSeries(points: MerchantSalesTrendPoint[]) {
  return [
    {
      name: 'GMV',
      type: 'line',
      smooth: true,
      yAxisIndex: 0,
      data: points.map((p) => Number(readFen(p, 'totalGmv') ?? 0) / 100),
      itemStyle: { color: '#2563eb' },
      areaStyle: { color: 'rgba(37, 99, 235, 0.08)' }
    },
    {
      name: '退款',
      type: 'line',
      smooth: true,
      yAxisIndex: 0,
      data: points.map((p) => Number(readFen(p, 'totalRefund') ?? 0) / 100),
      itemStyle: { color: '#ef4444' }
    },
    {
      name: '核销',
      type: 'line',
      smooth: true,
      yAxisIndex: 0,
      data: points.map((p) => Number(readFen(p, 'totalVerify') ?? 0) / 100),
      itemStyle: { color: '#10b981' }
    },
    {
      name: '成单数',
      type: 'line',
      smooth: true,
      yAxisIndex: 1,
      data: points.map((p) => p.paidOrderCount),
      itemStyle: { color: '#f97316' }
    }
  ];
}

export function buildMerchantSalesTrendOption(points: MerchantSalesTrendPoint[]) {
  if (points.length === 0) return {};
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 8 },
    grid: { left: 60, right: 60, top: 36, bottom: 30 },
    xAxis: { type: 'category', data: points.map((p) => p.bucket) },
    yAxis: [
      { type: 'value', name: '金额', position: 'left' },
      { type: 'value', name: '成单数', position: 'right' }
    ],
    series: buildMerchantSalesTrendSeries(points)
  };
}

export function useMerchantSalesDerived(params: {
  windowSel: Ref<MerchantSalesWindow>;
  summary: Ref<MerchantSalesSummary | null>;
  trend: Ref<MerchantSalesTrendPoint[]>;
  ranking: Ref<MerchantSalesRanking>;
}) {
  const rankingPagination = computed(() => {
    const { page: p, pageSize: s, total } = params.ranking.value.pagination;
    return { page: p, pageSize: s, total, totalPages: Math.max(1, Math.ceil(total / s)) };
  });
  const windowLabel = computed(
    () => ({ day: '今日', week: '本周', month: '本月', year: '今年' })[params.windowSel.value]
  );
  const gmvLabel = computed(() => `${windowLabel.value} GMV`);
  const windowRange = computed(() => {
    if (!params.summary.value) return '';
    const { date, endDate } = params.summary.value;
    return date === endDate ? date : `${date} → ${endDate}`;
  });
  const trendOption = computed(() => buildMerchantSalesTrendOption(params.trend.value));
  return { rankingPagination, windowLabel, gmvLabel, windowRange, trendOption };
}

export function createMerchantSalesLoaders(state: MerchantSalesState) {
  async function loadRanking() {
    await loadMerchantSalesRanking({
      windowSel: state.windowSel.value,
      sortBy: state.sortBy.value,
      page: state.page.value,
      pageSize: state.pageSize.current,
      ranking: state.ranking,
      listLoading: state.listLoading,
      loadError: state.loadError,
      // Residual #228: forward as-of day on page flips too.
      date: state.kpiDate.value || undefined
    });
  }
  async function reload() {
    await reloadMerchantSales({
      loading: state.loading,
      loadError: state.loadError,
      page: state.page,
      windowSel: state.windowSel,
      sortBy: state.sortBy,
      pageSize: state.pageSize,
      summary: state.summary,
      trend: state.trend,
      ranking: state.ranking,
      listLoading: state.listLoading,
      kpiDate: state.kpiDate
    });
  }
  return { loadRanking, reload };
}

export function createMerchantSalesHandlers(args: {
  page: Ref<number>;
  pageSize: { current: number };
  windowSel: Ref<MerchantSalesWindow>;
  sortBy: Ref<MerchantSalesSort>;
  exporting: Ref<boolean>;
  loadError: Ref<string | null>;
  // Residual #228: as-of anchor day for export/force-refresh.
  kpiDate: Ref<string>;
  reload: () => Promise<void>;
  loadRanking: () => Promise<void>;
}) {
  return {
    onWindowChange: () => {
      args.page.value = 1;
      void args.reload();
    },
    onPageChange: (next: number) => {
      args.page.value = next;
      void args.loadRanking();
    },
    onSizeChange: (nextSize: number) => {
      args.pageSize.current = nextSize;
      args.page.value = 1;
      void args.loadRanking();
    },
    onExport: () =>
      exportMerchantSales(
        args.exporting,
        args.windowSel.value,
        args.sortBy.value,
        args.kpiDate.value || undefined
      ),
    onForceRefresh: () =>
      forceRefreshAndReload(
        args.exporting,
        args.loadError,
        args.reload,
        args.kpiDate.value || undefined
      )
  };
}

export const merchantSalesFormatters = {
  rowClass: ({ row }: { row: Record<string, unknown> }) =>
    merchantSalesRowClass(row as { refundRate: number; verifyRate: number; gmv: number }),
  rateClass,
  rateClassInv,
  displayMoney,
  formatNumber,
  formatPercent
};
