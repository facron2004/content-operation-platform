import { onMounted, ref, type Ref } from 'vue';
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

export function createMerchantSalesState() {
  return {
    loading: ref(false),
    listLoading: ref(false),
    exporting: ref(false),
    loadError: ref<string | null>(null),
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
  loadError: Ref<string | null>,
  // Residual #228: as-of anchor day.
  date?: string
) {
  try {
    summary.value = await getMerchantSalesSummary({
      window: windowSel,
      date: date || undefined
    });
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载汇总 KPI 失败');
  }
}

export async function loadMerchantSalesTrend(
  windowSel: MerchantSalesWindow,
  trend: Ref<MerchantSalesTrendPoint[]>,
  loadError: Ref<string | null>,
  // Residual #228: as-of anchor day.
  date?: string
) {
  if (windowSel === 'day') {
    trend.value = [];
    return;
  }
  try {
    trend.value = (
      await getMerchantSalesTrend({
        window: windowSel as Exclude<MerchantSalesWindow, 'day'>,
        date: date || undefined
      })
    ).items;
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载趋势失败');
  }
}

export async function loadMerchantSalesRanking(params: {
  windowSel: MerchantSalesWindow;
  sortBy: MerchantSalesSort;
  page: number;
  pageSize: number;
  ranking: Ref<MerchantSalesRanking>;
  listLoading: Ref<boolean>;
  loadError: Ref<string | null>;
  // Residual #228: as-of anchor day.
  date?: string;
}) {
  params.listLoading.value = true;
  try {
    params.ranking.value = await getMerchantSalesRanking({
      window: params.windowSel,
      sortBy: params.sortBy,
      page: params.page,
      pageSize: params.pageSize,
      date: params.date || undefined
    });
  } catch (err) {
    params.loadError.value = extractErrorMessage(err, '加载商家排行失败');
  } finally {
    params.listLoading.value = false;
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
  // Residual #228: recompute the selected as-of day when set.
  date?: string
) {
  const day = date || localDateKey(new Date());
  const result = await postMerchantSalesRefresh({ startDate: day, endDate: day });
  ElMessage.success(
    `商家销售重算完成 [${result.startDate} → ${result.endDate}] 影响 ${result.rowsUpserted} 条`
  );
  return result;
}

export async function reloadMerchantSales(options: {
  loading: Ref<boolean>;
  loadError: Ref<string | null>;
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
}) {
  options.loading.value = true;
  options.loadError.value = null;
  options.page.value = 1;
  const asOf = options.kpiDate?.value || undefined;
  await Promise.all([
    loadMerchantSalesSummary(options.windowSel.value, options.summary, options.loadError, asOf),
    loadMerchantSalesTrend(options.windowSel.value, options.trend, options.loadError, asOf),
    loadMerchantSalesRanking({
      windowSel: options.windowSel.value,
      sortBy: options.sortBy.value,
      page: options.page.value,
      pageSize: options.pageSize.current,
      ranking: options.ranking,
      listLoading: options.listLoading,
      loadError: options.loadError,
      date: asOf
    })
  ]);
  options.loading.value = false;
}

export async function forceRefreshAndReload(
  exporting: Ref<boolean>,
  loadError: Ref<string | null>,
  reload: () => Promise<void>,
  // Residual #228: recompute selected as-of day.
  date?: string
) {
  exporting.value = true;
  try {
    await forceRefreshMerchantSales(loadError, date);
    await reload();
  } catch (err) {
    loadError.value = extractErrorMessage(err, '手动重算失败');
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
