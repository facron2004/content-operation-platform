import { computed, onScopeDispose, type Ref } from 'vue';
import { beijingDateKey, startOfWeekKey } from '@content/shared';
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
  reloadMerchantSales,
  type MerchantSalesRequestGuard
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
  // Residual #228 anchor — window labels must follow the selected 业务日.
  kpiDate: Ref<string>;
  summary: Ref<MerchantSalesSummary | null>;
  trend: Ref<MerchantSalesTrendPoint[]>;
  ranking: Ref<MerchantSalesRanking>;
}) {
  const rankingPagination = computed(() => {
    const { page: p, pageSize: s, total } = params.ranking.value.pagination;
    return { page: p, pageSize: s, total, totalPages: Math.max(1, Math.ceil(total / s)) };
  });
  const windowLabel = computed(() => {
    // Label follows the anchor's calendar period (backend resolves the same way).
    const today = beijingDateKey(new Date());
    const anchor = params.kpiDate.value || today;
    const isCurrent = {
      day: anchor === today,
      week: startOfWeekKey(anchor) === startOfWeekKey(today),
      month: anchor.slice(0, 7) === today.slice(0, 7),
      year: anchor.slice(0, 4) === today.slice(0, 4)
    }[params.windowSel.value];
    const labels = {
      day: ['今日', '当日'],
      week: ['本周', '该周'],
      month: ['本月', '该月'],
      year: ['今年', '该年']
    } as const;
    return isCurrent ? labels[params.windowSel.value][0] : labels[params.windowSel.value][1];
  });
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
  let disposed = false;
  let rankingRequestId = 0;
  let reloadRequestId = 0;
  let refreshRequestId = 0;

  async function loadRanking() {
    if (disposed) return;
    const requestId = ++rankingRequestId;
    const isCurrent: MerchantSalesRequestGuard = () => !disposed && requestId === rankingRequestId;
    await loadMerchantSalesRanking({
      windowSel: state.windowSel.value,
      sortBy: state.sortBy.value,
      page: state.page.value,
      pageSize: state.pageSize.current,
      ranking: state.ranking,
      listLoading: state.listLoading,
      rankingError: state.rankingError,
      // Residual #228: forward as-of day on page flips too.
      date: state.kpiDate.value || undefined,
      isCurrent
    });
  }
  async function reload() {
    if (disposed) return;
    const requestId = ++reloadRequestId;
    const rankingId = ++rankingRequestId;
    state.refreshError.value = null;
    const isCurrent: MerchantSalesRequestGuard = () => !disposed && requestId === reloadRequestId;
    const isRankingCurrent: MerchantSalesRequestGuard = () =>
      !disposed && rankingId === rankingRequestId;
    await reloadMerchantSales({
      loading: state.loading,
      summaryError: state.summaryError,
      trendError: state.trendError,
      rankingError: state.rankingError,
      page: state.page,
      windowSel: state.windowSel,
      sortBy: state.sortBy,
      pageSize: state.pageSize,
      summary: state.summary,
      trend: state.trend,
      ranking: state.ranking,
      listLoading: state.listLoading,
      kpiDate: state.kpiDate,
      isCurrent,
      isRankingCurrent
    });
  }
  async function forceRefresh() {
    if (disposed || state.exporting.value) return;
    const requestId = ++refreshRequestId;
    const summary = state.summary.value;
    // Recompute exactly what is on screen: week/month span multiple days.
    const range = summary ? { start: summary.date, end: summary.endDate } : undefined;
    await forceRefreshAndReload(
      state.exporting,
      state.refreshError,
      reload,
      state.kpiDate.value || undefined,
      () => !disposed && requestId === refreshRequestId,
      range
    );
  }

  onScopeDispose(() => {
    disposed = true;
    rankingRequestId += 1;
    reloadRequestId += 1;
    refreshRequestId += 1;
    state.loading.value = false;
    state.listLoading.value = false;
    state.exporting.value = false;
  }, true);

  return { loadRanking, reload, forceRefresh };
}

export function createMerchantSalesHandlers(args: {
  page: Ref<number>;
  pageSize: { current: number };
  windowSel: Ref<MerchantSalesWindow>;
  sortBy: Ref<MerchantSalesSort>;
  exporting: Ref<boolean>;
  // Residual #228: as-of anchor day for export/force-refresh.
  kpiDate: Ref<string>;
  reload: () => Promise<void>;
  loadRanking: () => Promise<void>;
  forceRefresh: () => Promise<void>;
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
    onForceRefresh: args.forceRefresh
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
