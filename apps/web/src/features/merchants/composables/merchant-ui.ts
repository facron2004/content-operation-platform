import { computed, onMounted, watch, type Ref } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';
import type { MerchantTrendResponse } from '../../../services/api/merchant.api';
import type { StaleBucket } from '../../../services/api/zero-sales.api';
import { STALE_BUCKET_COLORS, STALE_BUCKET_LABELS } from '../../../services/api/zero-sales.api';
import {
  formatGmv as formatGmvShared,
  formatPercent,
  readFen,
  sumMoneyFen
} from '../../../utils/format';
import { type createMerchantState } from './merchant-core';

type MerchantState = ReturnType<typeof createMerchantState>;

const staleColor = (b: StaleBucket) => STALE_BUCKET_COLORS[b] ?? '#94a3b8';
const staleLabel = (b: StaleBucket) => STALE_BUCKET_LABELS[b] ?? b;

function buildMerchantTrendSummary(trend: MerchantTrendResponse | null) {
  if (!trend) return { totalGmv: 0, conversionRate: 0 };
  // VNext §7.4.5：用整数分求和（替代浮点 reduce 累加）
  const totalGmv = Number(sumMoneyFen(trend.trend, 'gmv')) / 100;
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
        data: trend.trend.map((p) => Number(readFen(p, 'gmv') ?? 0) / 100),
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
  reloadList: (force?: boolean) => Promise<void>;
  reloadDetail: (force?: boolean) => Promise<void>;
  isCurrent?: () => boolean;
}) {
  const isCurrent = params.isCurrent ?? (() => true);
  watch(
    () => params.route.query.merchantId,
    (id) => {
      if (!isCurrent()) return;
      if (typeof id === 'string' && id !== params.selectedMerchantId.value) {
        params.selectedMerchantId.value = id;
        params.reloadDetail();
      }
    }
  );
  const loadInitialRouteData = async () => {
    if (!isCurrent()) return;
    await params.reloadList();
    if (!isCurrent()) return;
    if (params.selectedMerchantId.value) {
      await params.reloadDetail();
      if (!isCurrent()) return;
      params.selectedMerchant.value =
        params.merchants.value.find((x) => x.merchantId === params.selectedMerchantId.value) ??
        null;
    }
  };
  onMounted(() => {
    void loadInitialRouteData().catch(() => undefined);
  });
}

export function buildMerchantActions(options: {
  router: Router;
  state: MerchantState;
  reloadList: (force?: boolean) => Promise<void>;
  reloadDetail: (force?: boolean) => Promise<void>;
  selectMerchant: (id: string) => void;
}) {
  const { page, hasMore, selectedMerchantId, trend } = options.state;
  return {
    listHeight: 'calc(100vh - 260px)',
    trendSummary: computed(() => buildMerchantTrendSummary(trend.value)),
    trendOption: computed(() => buildMerchantTrendOption(trend.value)),
    reload: async () => Promise.all([options.reloadList(true), options.reloadDetail(true)]),
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
