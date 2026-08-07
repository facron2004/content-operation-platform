import { computed, onMounted, onScopeDispose, ref, type Ref } from 'vue';
import {
  getRefundToday,
  getRefundTopMerchants,
  getRefundTrend,
  getVerifyToday,
  getVerifyTrend,
  type RefundTrendPoint,
  type RefundWindow,
  type TopMerchantRow,
  type TrendBucket,
  type VerifyTrendPoint
} from '../../../services/api/refund.api';
import { extractErrorMessage } from '../../../services/http-client';
import { buildRefundVerifyTrendOption } from './refund-verify-ui';

export type RefundVerifyTab = 'refund' | 'verify';

export interface RefundVerifyTrendPoint {
  date: string;
  rate: number;
  amount: number;
  count: number;
  paidOrderCount: number;
}

export type RefundTodayPayload = {
  date: string;
  totalRefund: number;
  totalGmv: number;
  refundRate: number;
  refundCount: number;
  paidOrderCount: number;
  topRefundMerchants: TopMerchantRow[];
  updatedAt: string;
};

export type VerifyTodayPayload = {
  date: string;
  totalVerify: number;
  totalGmv: number;
  verifyRate: number;
  verifyCount: number;
  paidOrderCount: number;
  topVerifyMerchants: TopMerchantRow[];
  updatedAt: string;
};

export function createRefundVerifyState() {
  return {
    loading: ref(false),
    listLoading: ref(false),
    loadError: ref<string | null>(null),
    activeTab: ref<RefundVerifyTab>('refund'),
    trendDays: ref<7 | 30>(7),
    sortBy: ref<'refundDesc' | 'verifyDesc'>('refundDesc'),
    // Residual #226: as-of business day (getRefundToday/getVerifyToday already accept date).
    // Empty string means "server default today".
    kpiDate: ref(''),
    // 周期口径: 今日/本周/本月/本年 (day/week/month/year) — 影响 KPI 与商家榜.
    kpiWindow: ref<RefundWindow>('day'),
    // 趋势聚合粒度: 按日/周/月/年 (day/week/month/year).
    trendBucket: ref<TrendBucket>('day'),
    // Residual #229: top-merchants pagination (API returns hasMore; SPA used page=1 only).
    merchantPage: ref(1),
    merchantPageSize: ref(20),
    merchantHasMore: ref(false),
    // Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty.
    merchantTruncated: ref(false),
    merchantLimit: ref<number | null>(null),
    refundToday: ref<RefundTodayPayload | null>(null),
    verifyToday: ref<VerifyTodayPayload | null>(null),
    trend: ref<RefundVerifyTrendPoint[]>([]),
    topMerchants: ref<TopMerchantRow[]>([])
  };
}

function mapRefundTrend(rows: RefundTrendPoint[]): RefundVerifyTrendPoint[] {
  return rows.map((r) => ({
    date: r.date,
    rate: r.refundRate,
    amount: r.totalRefund,
    count: r.refundCount,
    paidOrderCount: r.paidOrderCount
  }));
}

function mapVerifyTrend(rows: VerifyTrendPoint[]): RefundVerifyTrendPoint[] {
  return rows.map((r) => ({
    date: r.date,
    rate: r.verifyRate,
    amount: r.totalVerify,
    count: r.verifyCount,
    paidOrderCount: r.paidOrderCount
  }));
}

async function loadRefundOrVerifyToday(
  activeTab: RefundVerifyTab,
  refundToday: Ref<RefundTodayPayload | null>,
  verifyToday: Ref<VerifyTodayPayload | null>,
  loadError: Ref<string | null>,
  isCurrent: () => boolean,
  // Residual #226: as-of business day.
  date?: string,
  // 周期口径: 影响 KPI 与商家榜的 今日/本周/本月/本年 窗口.
  window?: RefundWindow
) {
  try {
    const asOf = date || undefined;
    if (activeTab === 'refund') {
      const result = await getRefundToday(asOf, window);
      if (!isCurrent()) return;
      refundToday.value = result;
    } else {
      const result = await getVerifyToday(asOf, window);
      if (!isCurrent()) return;
      verifyToday.value = result;
    }
  } catch (err) {
    if (!isCurrent()) return;
    loadError.value = extractErrorMessage(err, '加载今日 KPI 失败');
  }
}

async function loadRefundOrVerifyTrend(
  activeTab: RefundVerifyTab,
  trendDays: 7 | 30,
  trend: Ref<RefundVerifyTrendPoint[]>,
  loadError: Ref<string | null>,
  isCurrent: () => boolean,
  // Residual #226: endDate aligns trend window with KPI as-of day.
  endDate?: string,
  // 趋势聚合粒度: 按日/周/月/年.
  bucket?: TrendBucket
) {
  try {
    const asOf = endDate || undefined;
    const rows =
      activeTab === 'refund'
        ? mapRefundTrend(await getRefundTrend(trendDays, asOf, bucket))
        : mapVerifyTrend(await getVerifyTrend(trendDays, asOf, bucket));
    if (!isCurrent()) return;
    trend.value = rows;
  } catch (err) {
    if (!isCurrent()) return;
    loadError.value = extractErrorMessage(err, '加载趋势失败');
  }
}

async function loadRefundTopMerchants(params: {
  sortBy: 'refundDesc' | 'verifyDesc';
  page: number;
  pageSize: number;
  topMerchants: Ref<TopMerchantRow[]>;
  hasMore: Ref<boolean>;
  // Residual #265: optional honesty sinks.
  truncated?: Ref<boolean>;
  limit?: Ref<number | null>;
  listLoading: Ref<boolean>;
  loadError: Ref<string | null>;
  isCurrent: () => boolean;
  // 周期口径: 影响商家榜的 今日/本周/本月/本年 窗口.
  window?: RefundWindow;
  /** 周期锚点日期(可选). */
  date?: string;
}) {
  params.listLoading.value = true;
  try {
    // Residual #229: honor page/pageSize + hasMore from API.
    const result = await getRefundTopMerchants({
      sortBy: params.sortBy,
      page: params.page,
      pageSize: params.pageSize,
      window: params.window,
      date: params.date
    });
    if (!params.isCurrent()) return;
    params.topMerchants.value = result.items;
    params.hasMore.value = !!result.hasMore;
    // Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty.
    if (params.truncated) params.truncated.value = Boolean(result.truncated);
    if (params.limit) {
      params.limit.value =
        typeof result.limit === 'number' && Number.isFinite(result.limit) ? result.limit : null;
    }
  } catch (err) {
    if (!params.isCurrent()) return;
    params.loadError.value = extractErrorMessage(err, '加载商家榜失败');
  } finally {
    if (params.isCurrent()) params.listLoading.value = false;
  }
}

type RefundVerifyBindState = ReturnType<typeof createRefundVerifyState>;

function createRefundVerifyComputed(state: RefundVerifyBindState) {
  return {
    currentGmv: computed(() =>
      state.activeTab.value === 'refund'
        ? state.refundToday.value?.totalGmv
        : state.verifyToday.value?.totalGmv
    ),
    currentRate: computed(() =>
      state.activeTab.value === 'refund'
        ? (state.refundToday.value?.refundRate ?? 0)
        : (state.verifyToday.value?.verifyRate ?? 0)
    ),
    trendOption: computed(() =>
      buildRefundVerifyTrendOption(state.trend.value, state.activeTab.value)
    )
  };
}

export function bindRefundVerifyLoaders(state: RefundVerifyBindState) {
  let disposed = false;
  let reloadRequestId = 0;
  let todayRequestId = 0;
  let trendRequestId = 0;
  let merchantRequestId = 0;

  async function reload() {
    if (disposed) return;
    const currentReloadRequestId = ++reloadRequestId;
    const currentTodayRequestId = ++todayRequestId;
    const currentTrendRequestId = ++trendRequestId;
    const currentMerchantRequestId = ++merchantRequestId;
    state.loading.value = true;
    state.loadError.value = null;
    // Full reload resets merchant page (sort/tab/date changes).
    state.merchantPage.value = 1;
    const activeTab = state.activeTab.value;
    const trendDays = state.trendDays.value;
    const sortBy = state.sortBy.value;
    const pageSize = state.merchantPageSize.value;
    const asOf = state.kpiDate.value || undefined;
    const kpiWindow = state.kpiWindow.value;
    await Promise.all([
      loadRefundOrVerifyToday(
        activeTab,
        state.refundToday,
        state.verifyToday,
        state.loadError,
        () => !disposed && currentTodayRequestId === todayRequestId,
        asOf,
        kpiWindow
      ),
      loadRefundOrVerifyTrend(
        activeTab,
        trendDays,
        state.trend,
        state.loadError,
        () => !disposed && currentTrendRequestId === trendRequestId,
        asOf,
        state.trendBucket.value
      ),
      loadRefundTopMerchants({
        sortBy,
        page: state.merchantPage.value,
        pageSize,
        topMerchants: state.topMerchants,
        hasMore: state.merchantHasMore,
        truncated: state.merchantTruncated,
        limit: state.merchantLimit,
        listLoading: state.listLoading,
        loadError: state.loadError,
        isCurrent: () => !disposed && currentMerchantRequestId === merchantRequestId,
        window: kpiWindow,
        date: asOf
      })
    ]);
    if (!disposed && currentReloadRequestId === reloadRequestId) state.loading.value = false;
  }
  async function loadTopMerchants(resetPage = false) {
    if (disposed) return;
    if (resetPage) state.merchantPage.value = 1;
    const currentMerchantRequestId = ++merchantRequestId;
    await loadRefundTopMerchants({
      sortBy: state.sortBy.value,
      page: state.merchantPage.value,
      pageSize: state.merchantPageSize.value,
      topMerchants: state.topMerchants,
      hasMore: state.merchantHasMore,
      truncated: state.merchantTruncated,
      limit: state.merchantLimit,
      listLoading: state.listLoading,
      loadError: state.loadError,
      isCurrent: () => !disposed && currentMerchantRequestId === merchantRequestId,
      window: state.kpiWindow.value,
      date: state.kpiDate.value || undefined
    });
  }

  async function loadTrend() {
    if (disposed) return;
    const currentTrendRequestId = ++trendRequestId;
    await loadRefundOrVerifyTrend(
      state.activeTab.value,
      state.trendDays.value,
      state.trend,
      state.loadError,
      () => !disposed && currentTrendRequestId === trendRequestId,
      state.kpiDate.value || undefined,
      state.trendBucket.value
    );
  }

  onScopeDispose(() => {
    disposed = true;
    reloadRequestId += 1;
    todayRequestId += 1;
    trendRequestId += 1;
    merchantRequestId += 1;
    state.loading.value = false;
    state.listLoading.value = false;
  });

  onMounted(reload);
  return {
    reload,
    loadTrend,
    loadTopMerchants: () => loadTopMerchants(true),
    prevMerchantPage() {
      if (state.merchantPage.value > 1) {
        state.merchantPage.value -= 1;
        void loadTopMerchants(false);
      }
    },
    nextMerchantPage() {
      if (state.merchantHasMore.value) {
        state.merchantPage.value += 1;
        void loadTopMerchants(false);
      }
    },
    ...createRefundVerifyComputed(state)
  };
}
