import { computed, onMounted, onScopeDispose, ref } from 'vue';
import {
  getOverviewDistribution,
  getOverviewKpis,
  type OverviewDistributionRow,
  type OverviewKpi
} from '../../../services/api/overview.api';
import type { StaleBucket } from '../../../services/api/zero-sales.api';
import { isRequestCanceled } from '../../../services/http-client-utils';
import { buildCategoryBar } from '../../../utils/chart-options';
import { STALE_BUCKET_CHART_COLORS, STALE_BUCKET_CHART_LABELS } from '../../../utils/chart-theme';
import { STALE_BUCKET_LABELS, useZeroSales } from './useZeroSales';

function buildZeroSalesStaleOption(rows: OverviewDistributionRow[]) {
  return buildCategoryBar({
    items: rows.map((r) => ({
      label: STALE_BUCKET_CHART_LABELS[r.key] ?? r.key,
      value: r.totalSku,
      color: STALE_BUCKET_CHART_COLORS[r.key] ?? '#94a3b8',
      key: r.key,
      extra: { 剩余库存: r.stockLeft }
    })),
    yName: 'SKU 数',
    showShare: true,
    rotate: 20
  });
}
function buildZeroSalesDimOption(rows: OverviewDistributionRow[], dim: 'area' | 'category') {
  return buildCategoryBar({
    items: rows.map((r) => ({
      label: r.key,
      value: r.totalSku,
      key: r.key,
      extra: { 剩余库存: r.stockLeft }
    })),
    yName: dim === 'area' ? '区域 SKU' : '品类 SKU',
    showShare: true,
    rotate: 30
  });
}

function useZeroSalesSummary(params: { onBucketSelect: (bucket: string) => void }) {
  const summaryLoading = ref(false),
    summaryError = ref<string | null>(null),
    overviewKpi = ref<OverviewKpi | null>(null),
    staleDistribution = ref<OverviewDistributionRow[]>([]),
    dimDistribution = ref<OverviewDistributionRow[]>([]),
    dim = ref<'area' | 'category'>('area');
  let disposed = false;
  let summaryRequestId = 0;
  let dimRequestId = 0;
  const staleOption = computed(() => buildZeroSalesStaleOption(staleDistribution.value)),
    dimOption = computed(() => buildZeroSalesDimOption(dimDistribution.value, dim.value));
  async function loadSummary() {
    if (disposed) return;
    const currentSummaryRequestId = ++summaryRequestId;
    const currentDimRequestId = ++dimRequestId;
    const currentDim = dim.value;
    summaryLoading.value = true;
    summaryError.value = null;
    try {
      // Residual #288: distribution returns { items, limit, matched, truncated }.
      const [kpi, stale, dimRows] = await Promise.all([
        getOverviewKpis(),
        getOverviewDistribution('stale', 10),
        getOverviewDistribution(currentDim, 12)
      ]);
      if (disposed || currentSummaryRequestId !== summaryRequestId) return;
      overviewKpi.value = kpi;
      staleDistribution.value = stale.items ?? [];
      if (currentDimRequestId === dimRequestId) dimDistribution.value = dimRows.items ?? [];
    } catch (err) {
      if (!disposed && currentSummaryRequestId === summaryRequestId && !isRequestCanceled(err))
        summaryError.value = err instanceof Error ? err.message : '加载零动销总览失败';
    } finally {
      if (!disposed && currentSummaryRequestId === summaryRequestId) summaryLoading.value = false;
    }
  }
  async function loadDim(next: 'area' | 'category') {
    if (disposed) return;
    dim.value = next;
    const currentRequestId = ++dimRequestId;
    summaryError.value = null;
    try {
      // Residual #288: unwrap items from distribution payload.
      const payload = await getOverviewDistribution(next, 12);
      if (!disposed && currentRequestId === dimRequestId)
        dimDistribution.value = payload.items ?? [];
    } catch (err) {
      if (!disposed && currentRequestId === dimRequestId && !isRequestCanceled(err)) {
        summaryError.value = err instanceof Error ? err.message : '加载零动销分布失败';
      }
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    summaryRequestId += 1;
    dimRequestId += 1;
    summaryLoading.value = false;
  }
  return {
    summaryLoading,
    summaryError,
    overviewKpi,
    dim,
    staleOption,
    dimOption,
    loadSummary,
    loadDim,
    dispose,
    onStaleBarClick: (p: { key?: string }) => {
      if (p.key) params.onBucketSelect(p.key);
    }
  };
}

export function useZeroSalesPage() {
  const zs = useZeroSales();
  const summary = useZeroSalesSummary({
    onBucketSelect: (bucket) => {
      zs.staleBucket.value = bucket as StaleBucket;
      zs.onFilterChange();
    }
  });
  onScopeDispose(summary.dispose);
  function onBucketChange(value: string) {
    zs.staleBucket.value = value as typeof zs.staleBucket.value;
    zs.onFilterChange();
  }
  async function reloadAll() {
    await Promise.all([zs.reload(), summary.loadSummary()]);
  }
  onMounted(() => {
    void summary.loadSummary();
  });
  return {
    ...zs,
    bucketLabel: computed(() => STALE_BUCKET_LABELS[zs.staleBucket.value]),
    onBucketChange,
    reloadAll,
    overviewKpi: summary.overviewKpi,
    summaryLoading: summary.summaryLoading,
    summaryError: summary.summaryError,
    dim: summary.dim,
    staleOption: summary.staleOption,
    dimOption: summary.dimOption,
    loadDim: summary.loadDim,
    onStaleBarClick: (key: string) => summary.onStaleBarClick({ key })
  };
}
