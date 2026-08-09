import { computed, onMounted, ref, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import { localDateKey } from '@content/shared';
import {
  getMerchantSalesExportUrl,
  getMerchantSalesRanking,
  getMerchantSalesSummary,
  getMerchantSalesTrend,
  postMerchantSalesRefresh,
  type MerchantSalesRanking,
  type MerchantSalesSort,
  type MerchantSalesSummary,
  type MerchantSalesTrendPoint,
  type MerchantSalesWindow
} from '../../../services/api/merchant-sales.api';
import { downloadBlob, extractErrorMessage } from '../../../services/http-client';

export type MerchantSalesRequestGuard = () => boolean;

const alwaysCurrent: MerchantSalesRequestGuard = () => true;

export function createMerchantSalesState() {
  const summaryError = ref<string | null>(null);
  const trendError = ref<string | null>(null);
  const rankingError = ref<string | null>(null);
  return {
    loading: ref(false),
    listLoading: ref(false),
    exporting: ref(false),
    summaryError,
    trendError,
    rankingError,
    refreshError: ref<string | null>(null),
    // Compatibility aggregate for existing consumers; the view renders the
    // three read errors separately so one request cannot hide another.
    loadError: computed(() => summaryError.value || trendError.value || rankingError.value),
    windowSel: ref<MerchantSalesWindow>('day'),
    sortBy: ref<MerchantSalesSort>('gmvDesc'),
    // Residual #228: as-of anchor day (API date/endDate already accept free dates).
    // Empty string means "server default today".
    kpiDate: ref(''),
    page: ref(1),
    pageSize: { current: 20 },
    summary: ref<MerchantSalesSummary | null>(null),
    trend: ref<MerchantSalesTrendPoint[]>([]),
    ranking: ref<MerchantSalesRanking>({
      items: [],
      pagination: { page: 1, pageSize: 20, hasMore: false, total: 0 }
    })
  };
}

export function mountMerchantSalesReload(reload: () => Promise<void>) {
  onMounted(() => reload());
}

export async function loadMerchantSalesSummary(
  windowSel: MerchantSalesWindow,
  summary: Ref<MerchantSalesSummary | null>,
  summaryError: Ref<string | null>,
  // Residual #228: as-of anchor day.
  date?: string,
  isCurrent: MerchantSalesRequestGuard = alwaysCurrent
) {
  if (isCurrent()) summaryError.value = null;
  try {
    const result = await getMerchantSalesSummary({
      window: windowSel,
      date: date || undefined
    });
    if (isCurrent()) summary.value = result;
  } catch (err) {
    if (isCurrent()) summaryError.value = extractErrorMessage(err, '加载汇总 KPI 失败');
  }
}

export async function loadMerchantSalesTrend(
  windowSel: MerchantSalesWindow,
  trend: Ref<MerchantSalesTrendPoint[]>,
  trendError: Ref<string | null>,
  // Residual #228: as-of anchor day.
  date?: string,
  isCurrent: MerchantSalesRequestGuard = alwaysCurrent
) {
  if (windowSel === 'day') {
    if (isCurrent()) {
      trend.value = [];
      trendError.value = null;
    }
    return;
  }
  if (isCurrent()) trendError.value = null;
  try {
    const result = (
      await getMerchantSalesTrend({
        window: windowSel as Exclude<MerchantSalesWindow, 'day'>,
        date: date || undefined
      })
    ).items;
    if (isCurrent()) trend.value = result;
  } catch (err) {
    if (isCurrent()) trendError.value = extractErrorMessage(err, '加载趋势失败');
  }
}

export async function loadMerchantSalesRanking(params: {
  windowSel: MerchantSalesWindow;
  sortBy: MerchantSalesSort;
  page: number;
  pageSize: number;
  ranking: Ref<MerchantSalesRanking>;
  listLoading: Ref<boolean>;
  rankingError: Ref<string | null>;
  // Residual #228: as-of anchor day.
  date?: string;
  isCurrent?: MerchantSalesRequestGuard;
}) {
  const isCurrent = params.isCurrent ?? alwaysCurrent;
  if (!isCurrent()) return;
  params.rankingError.value = null;
  params.listLoading.value = true;
  try {
    const result = await getMerchantSalesRanking({
      window: params.windowSel,
      sortBy: params.sortBy,
      page: params.page,
      pageSize: params.pageSize,
      date: params.date || undefined
    });
    if (isCurrent()) params.ranking.value = result;
  } catch (err) {
    if (isCurrent()) params.rankingError.value = extractErrorMessage(err, '加载商家排行失败');
  } finally {
    if (isCurrent()) params.listLoading.value = false;
  }
}

export function exportMerchantSalesCsv(
  windowSel: MerchantSalesWindow,
  sortBy: MerchantSalesSort,
  // Residual #228: as-of anchor day.
  date?: string
) {
  downloadBlob(
    getMerchantSalesExportUrl({ window: windowSel, sortBy, date: date || undefined }),
    `商家销售-${windowSel ?? '全部'}.csv`
  );
}

export async function forceRefreshMerchantSales(
  _loadError: Ref<string | null>,
  // Residual #228: recompute the selected as-of day (or visible window range) when set.
  date?: string,
  isCurrent: MerchantSalesRequestGuard = alwaysCurrent,
  // Week/month windows span multiple days — recompute the resolved range, not just the anchor.
  range?: { start: string; end: string }
) {
  const start = range?.start || date || localDateKey(new Date());
  const end = range?.end || start;
  const result = await postMerchantSalesRefresh({ startDate: start, endDate: end });
  if (!isCurrent()) return;
  ElMessage.success(
    `商家销售重算完成 [${result.startDate} → ${result.endDate}] 影响 ${result.rowsUpserted} 条`
  );
  return result;
}

export async function reloadMerchantSales(options: {
  loading: Ref<boolean>;
  summaryError: Ref<string | null>;
  trendError: Ref<string | null>;
  rankingError: Ref<string | null>;
  page: Ref<number>;
  windowSel: Ref<MerchantSalesWindow>;
  sortBy: Ref<MerchantSalesSort>;
  pageSize: { current: number };
  summary: Ref<MerchantSalesSummary | null>;
  trend: Ref<MerchantSalesTrendPoint[]>;
  ranking: Ref<MerchantSalesRanking>;
  listLoading: Ref<boolean>;
  // Residual #228: as-of anchor day.
  kpiDate?: Ref<string>;
  isCurrent?: MerchantSalesRequestGuard;
  isRankingCurrent?: MerchantSalesRequestGuard;
}) {
  const isCurrent = options.isCurrent ?? alwaysCurrent;
  const isRankingCurrent = options.isRankingCurrent ?? isCurrent;
  if (!isCurrent()) return;
  options.loading.value = true;
  options.summaryError.value = null;
  options.trendError.value = null;
  options.rankingError.value = null;
  options.page.value = 1;
  const asOf = options.kpiDate?.value || undefined;
  await Promise.all([
    loadMerchantSalesSummary(
      options.windowSel.value,
      options.summary,
      options.summaryError,
      asOf,
      isCurrent
    ),
    loadMerchantSalesTrend(
      options.windowSel.value,
      options.trend,
      options.trendError,
      asOf,
      isCurrent
    ),
    loadMerchantSalesRanking({
      windowSel: options.windowSel.value,
      sortBy: options.sortBy.value,
      page: options.page.value,
      pageSize: options.pageSize.current,
      ranking: options.ranking,
      listLoading: options.listLoading,
      rankingError: options.rankingError,
      date: asOf,
      isCurrent: isRankingCurrent
    })
  ]);
  if (isCurrent()) options.loading.value = false;
}

export async function forceRefreshAndReload(
  exporting: Ref<boolean>,
  refreshError: Ref<string | null>,
  reload: () => Promise<void>,
  // Residual #228: recompute selected as-of day (or visible window range).
  date?: string,
  isCurrent: MerchantSalesRequestGuard = alwaysCurrent,
  range?: { start: string; end: string }
) {
  if (!isCurrent() || exporting.value) return;
  exporting.value = true;
  refreshError.value = null;
  try {
    const result = await forceRefreshMerchantSales(refreshError, date, isCurrent, range);
    if (result && isCurrent()) await reload();
  } catch (err) {
    if (isCurrent()) refreshError.value = extractErrorMessage(err, '手动重算失败');
  } finally {
    exporting.value = false;
  }
}

export function exportMerchantSales(
  exporting: Ref<boolean>,
  windowSel: MerchantSalesWindow,
  sortBy: MerchantSalesSort,
  // Residual #228: as-of anchor day.
  date?: string
) {
  exporting.value = true;
  try {
    exportMerchantSalesCsv(windowSel, sortBy, date);
  } finally {
    exporting.value = false;
  }
}
