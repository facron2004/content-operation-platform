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
  loadError: Ref<string | null>
) {
  try {
    if (activeTab === 'refund') refundToday.value = await getRefundToday();
    else verifyToday.value = await getVerifyToday();
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载今日 KPI 失败');
  }
}

async function loadRefundOrVerifyTrend(
  activeTab: RefundVerifyTab,
  trendDays: 7 | 30,
  trend: Ref<RefundVerifyTrendPoint[]>,
  loadError: Ref<string | null>
) {
  try {
    if (activeTab === 'refund') trend.value = mapRefundTrend(await getRefundTrend(trendDays));
    else trend.value = mapVerifyTrend(await getVerifyTrend(trendDays));
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载趋势失败');
  }
}

async function loadRefundTopMerchants(
  sortBy: 'refundDesc' | 'verifyDesc',
  topMerchants: Ref<TopMerchantRow[]>,
  listLoading: Ref<boolean>,
  loadError: Ref<string | null>
) {
  listLoading.value = true;
  try {
    const result = await getRefundTopMerchants({ sortBy, page: 1, pageSize: 20 });
    topMerchants.value = result.items;
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载商家榜失败');
  } finally {
    listLoading.value = false;
  }
}

type RefundVerifyBindState = ReturnType<typeof createRefundVerifyState>;

async function reloadRefundVerify(state: RefundVerifyBindState) {
  state.loading.value = true;
  state.loadError.value = null;
  await Promise.all([
    loadRefundOrVerifyToday(
      state.activeTab.value,
      state.refundToday,
      state.verifyToday,
      state.loadError
    ),
    loadRefundOrVerifyTrend(
      state.activeTab.value,
      state.trendDays.value,
      state.trend,
      state.loadError
    ),
    loadRefundTopMerchants(
      state.sortBy.value,
      state.topMerchants,
      state.listLoading,
      state.loadError
    )
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
  onMounted(reload);
  return {
    reload,
    loadTrend: () =>
      loadRefundOrVerifyTrend(
        state.activeTab.value,
        state.trendDays.value,
        state.trend,
        state.loadError
      ),
    loadTopMerchants: () =>
      loadRefundTopMerchants(
        state.sortBy.value,
        state.topMerchants,
        state.listLoading,
        state.loadError
      ),
    ...createRefundVerifyComputed(state)
  };
}
