import { computed, onMounted, ref, type Ref } from 'vue';
import {
  getRefundToday,
  getRefundTopMerchants,
  getRefundTrend,
  getVerifyToday,
  getVerifyTrend,
  type RefundTrendPoint,
  type TopMerchantRow,
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
  // Residual #226: as-of business day.
  date?: string
) {
  try {
    const asOf = date || undefined;
    if (activeTab === 'refund') refundToday.value = await getRefundToday(asOf);
    else verifyToday.value = await getVerifyToday(asOf);
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载今日 KPI 失败');
  }
}

async function loadRefundOrVerifyTrend(
  activeTab: RefundVerifyTab,
  trendDays: 7 | 30,
  trend: Ref<RefundVerifyTrendPoint[]>,
  loadError: Ref<string | null>,
  // Residual #226: endDate aligns trend window with KPI as-of day.
  endDate?: string
) {
  try {
    const asOf = endDate || undefined;
    if (activeTab === 'refund') trend.value = mapRefundTrend(await getRefundTrend(trendDays, asOf));
    else trend.value = mapVerifyTrend(await getVerifyTrend(trendDays, asOf));
  } catch (err) {
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
}) {
  params.listLoading.value = true;
  try {
    // Residual #229: honor page/pageSize + hasMore from API.
    const result = await getRefundTopMerchants({
      sortBy: params.sortBy,
      page: params.page,
      pageSize: params.pageSize
    });
    params.topMerchants.value = result.items;
    params.hasMore.value = !!result.hasMore;
    // Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty.
    if (params.truncated) params.truncated.value = Boolean(result.truncated);
    if (params.limit) {
      params.limit.value =
        typeof result.limit === 'number' && Number.isFinite(result.limit) ? result.limit : null;
    }
  } catch (err) {
    params.loadError.value = extractErrorMessage(err, '加载商家榜失败');
  } finally {
    params.listLoading.value = false;
  }
}

type RefundVerifyBindState = ReturnType<typeof createRefundVerifyState>;

async function reloadRefundVerify(state: RefundVerifyBindState) {
  state.loading.value = true;
  state.loadError.value = null;
  // Full reload resets merchant page (sort/tab/date changes).
  state.merchantPage.value = 1;
  const asOf = state.kpiDate.value || undefined;
  await Promise.all([
    loadRefundOrVerifyToday(
      state.activeTab.value,
      state.refundToday,
      state.verifyToday,
      state.loadError,
      asOf
    ),
    loadRefundOrVerifyTrend(
      state.activeTab.value,
      state.trendDays.value,
      state.trend,
      state.loadError,
      asOf
    ),
    loadRefundTopMerchants({
      sortBy: state.sortBy.value,
      page: state.merchantPage.value,
      pageSize: state.merchantPageSize.value,
      topMerchants: state.topMerchants,
      hasMore: state.merchantHasMore,
      truncated: state.merchantTruncated,
      limit: state.merchantLimit,
      listLoading: state.listLoading,
      loadError: state.loadError
    })
  ]);
  state.loading.value = false;
}

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
  async function reload() {
    await reloadRefundVerify(state);
  }
  async function loadTopMerchants(resetPage = false) {
    if (resetPage) state.merchantPage.value = 1;
    await loadRefundTopMerchants({
      sortBy: state.sortBy.value,
      page: state.merchantPage.value,
      pageSize: state.merchantPageSize.value,
      topMerchants: state.topMerchants,
      hasMore: state.merchantHasMore,
      truncated: state.merchantTruncated,
      limit: state.merchantLimit,
      listLoading: state.listLoading,
      loadError: state.loadError
    });
  }
  onMounted(reload);
  return {
    reload,
    loadTrend: () =>
      loadRefundOrVerifyTrend(
        state.activeTab.value,
        state.trendDays.value,
        state.trend,
        state.loadError,
        state.kpiDate.value || undefined
      ),
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
