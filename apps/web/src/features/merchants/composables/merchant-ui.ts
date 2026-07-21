import { computed, onMounted, watch, type Ref } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';
import type { MerchantTrendResponse } from '../../../services/api/merchant.api';
import type { StaleBucket } from '../../../services/api/zero-sales.api';
import { formatGmv as formatGmvShared, formatPercent } from '../../../utils/format';
import { type createMerchantState } from './merchant-core';

type MerchantState = ReturnType<typeof createMerchantState>;

const STALE_COLORS: Record<string, string> = {
  normal: '#10b981',
  stale_7d: '#fde68a',
  stale_15d: '#fb923c',
  stale_30d: '#ef4444',
  stale_60d: '#7f1d1d'
};
const STALE_LABELS: Record<string, string> = {
  normal: '正常',
  stale_7d: '7d 未销',
  stale_15d: '15d 未销',
  stale_30d: '30d 未销',
  stale_60d: '60d+ 未销'
};

const staleColor = (b: StaleBucket) => STALE_COLORS[b] ?? '#94a3b8';
const staleLabel = (b: StaleBucket) => STALE_LABELS[b] ?? b;

function buildMerchantTrendSummary(trend: MerchantTrendResponse | null) {
  if (!trend) return { totalGmv: 0, conversionRate: 0 };
  const totalGmv = trend.trend.reduce((sum, p) => sum + p.gmv, 0);
  const totalExposure = trend.trend.reduce((sum, p) => sum + p.exposureCount, 0);
  const totalOrder = trend.trend.reduce((sum, p) => sum + p.orderCount, 0);
  return { totalGmv, conversionRate: totalExposure > 0 ? totalOrder / totalExposure : 0 };
}

function buildMerchantTrendOption(trend: MerchantTrendResponse | null) {
  if (!trend || trend.trend.length === 0) return {};
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 50, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: trend.trend.map((p) => p.date.slice(5)) },
    yAxis: [
      { type: 'value', name: 'GMV', position: 'left' },
      { type: 'value', name: '转化率', position: 'right', axisLabel: { formatter: '{value}%' } }
    ],
    series: [
      {
        name: 'GMV',
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        data: trend.trend.map((p) => Number(p.gmv.toFixed(2))),
        itemStyle: { color: '#2563eb' },
        areaStyle: { color: 'rgba(37, 99, 235, 0.08)' }
      },
      {
        name: '转化率',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: trend.trend.map((p) => Number((p.conversionRate * 100).toFixed(2))),
        itemStyle: { color: '#f97316' }
      }
    ]
  };
}

function goZeroSalesForMerchant(router: Router, merchantId?: string) {
  if (!merchantId) return;
  router.push({ name: 'zero-sales', query: { merchantId, tab: 'sku' } });
}

function goPackageAnalysis(router: Router, packageId: string) {
  router.push({ name: 'package-analysis', params: { packageId }, query: { from: 'merchants' } });
}

export function bindMerchantRoute(params: {
  route: RouteLocationNormalizedLoaded;
  selectedMerchantId: Ref<string | undefined>;
  selectedMerchant: Ref<{ merchantId: string } | null>;
  merchants: Ref<Array<{ merchantId: string }>>;
  reloadList: () => Promise<void>;
  reloadDetail: () => Promise<void>;
}) {
  watch(
    () => params.route.query.merchantId,
    (id) => {
      if (typeof id === 'string' && id !== params.selectedMerchantId.value) {
        params.selectedMerchantId.value = id;
        params.reloadDetail();
      }
    }
  );
  onMounted(async () => {
    await params.reloadList();
    if (params.selectedMerchantId.value) {
      await params.reloadDetail();
      params.selectedMerchant.value =
        params.merchants.value.find((x) => x.merchantId === params.selectedMerchantId.value) ??
        null;
    }
  });
}

export function buildMerchantActions(options: {
  router: Router;
  state: MerchantState;
  reloadList: () => Promise<void>;
  reloadDetail: () => Promise<void>;
  selectMerchant: (id: string) => void;
}) {
  const { page, hasMore, selectedMerchantId, trend } = options.state;
  return {
    listHeight: 'calc(100vh - 260px)',
    trendSummary: computed(() => buildMerchantTrendSummary(trend.value)),
    trendOption: computed(() => buildMerchantTrendOption(trend.value)),
    reload: async () => Promise.all([options.reloadList(), options.reloadDetail()]),
    reloadList: options.reloadList,
    selectMerchant: options.selectMerchant,
    prevPage: () => {
      if (page.value > 1) {
        page.value -= 1;
        options.reloadList();
      }
    },
    nextPage: () => {
      if (hasMore.value) {
        page.value += 1;
        options.reloadList();
      }
    },
    goZeroSalesForMerchant: () => goZeroSalesForMerchant(options.router, selectedMerchantId.value),
    goAnalysis: (packageId: string) => goPackageAnalysis(options.router, packageId),
    formatGmv: (value: number) => formatGmvShared(value, false),
    formatPercent,
    staleColor,
    staleLabel
  };
}
