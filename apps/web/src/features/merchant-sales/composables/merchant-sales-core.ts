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
  loadError: Ref<string | null>
) {
  try {
    summary.value = await getMerchantSalesSummary({ window: windowSel });
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载汇总 KPI 失败');
  }
}

export async function loadMerchantSalesTrend(
  windowSel: MerchantSalesWindow,
  trend: Ref<MerchantSalesTrendPoint[]>,
  loadError: Ref<string | null>
) {
  if (windowSel === 'day') {
    trend.value = [];
    return;
  }
  try {
    trend.value = (
      await getMerchantSalesTrend({ window: windowSel as Exclude<MerchantSalesWindow, 'day'> })
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
}) {
  params.listLoading.value = true;
  try {
    params.ranking.value = await getMerchantSalesRanking({
      window: params.windowSel,
      sortBy: params.sortBy,
      page: params.page,
      pageSize: params.pageSize
    });
  } catch (err) {
    params.loadError.value = extractErrorMessage(err, '加载商家排行失败');
  } finally {
    params.listLoading.value = false;
  }
}

export function exportMerchantSalesCsv(windowSel: MerchantSalesWindow, sortBy: MerchantSalesSort) {
  downloadBlob(
    getMerchantSalesExportUrl({ window: windowSel, sortBy }),
    `商家销售-${windowSel ?? '全部'}.csv`
  );
}

export async function forceRefreshMerchantSales(_loadError: Ref<string | null>) {
  const today = localDateKey(new Date());
  const result = await postMerchantSalesRefresh({ startDate: today, endDate: today });
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
}) {
  options.loading.value = true;
  options.loadError.value = null;
  options.page.value = 1;
  await Promise.all([
    loadMerchantSalesSummary(options.windowSel.value, options.summary, options.loadError),
    loadMerchantSalesTrend(options.windowSel.value, options.trend, options.loadError),
    loadMerchantSalesRanking({
      windowSel: options.windowSel.value,
      sortBy: options.sortBy.value,
      page: options.page.value,
      pageSize: options.pageSize.current,
      ranking: options.ranking,
      listLoading: options.listLoading,
      loadError: options.loadError
    })
  ]);
  options.loading.value = false;
}

export async function forceRefreshAndReload(
  exporting: Ref<boolean>,
  loadError: Ref<string | null>,
  reload: () => Promise<void>
) {
  exporting.value = true;
  try {
    await forceRefreshMerchantSales(loadError);
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
  sortBy: MerchantSalesSort
) {
  exporting.value = true;
  try {
    exportMerchantSalesCsv(windowSel, sortBy);
  } finally {
    exporting.value = false;
  }
}
