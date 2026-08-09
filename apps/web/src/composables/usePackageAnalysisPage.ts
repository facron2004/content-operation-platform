import { computed, onMounted, onScopeDispose, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ContentPackage } from '@content/shared';
import { api, type PackageAnalysisResponse } from '../services/api';
import { extractErrorMessage } from '../services/http-client';

export function buildPackageScoreOption(analysis: PackageAnalysisResponse) {
  const dimensions = analysis.scoreBreakdown?.dimensions ?? [];
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 78, right: 18, top: 20, bottom: 26 },
    xAxis: { type: 'value', max: 100 },
    yAxis: { type: 'category', data: dimensions.map((item) => item.label) },
    series: [
      {
        type: 'bar',
        data: dimensions.map((item) => Math.round(item.score)),
        itemStyle: { color: '#2f6f73' },
        label: { show: true, position: 'right' }
      }
    ]
  };
}
export function formatInventoryTrendPoints(
  trend: Array<{ remainingStock: number }> | undefined
): string {
  return (trend ?? []).map((point) => point.remainingStock).join(' -> ') || '-';
}

export function usePackageAnalysisPage(packageId: string) {
  const router = useRouter(),
    loading = ref(false),
    loadError = ref<string | null>(null),
    analysis = ref<PackageAnalysisResponse>({} as PackageAnalysisResponse);
  const pkg = computed<ContentPackage | undefined>(() => analysis.value.package),
    scoreOption = computed(() => buildPackageScoreOption(analysis.value));
  const formatInventoryTrend = formatInventoryTrendPoints,
    goBack = () => router.push('/recommendations');
  let loadRequestId = 0;
  let disposed = false;
  const load = async () => {
    if (disposed) return;
    const requestId = ++loadRequestId;
    loading.value = true;
    loadError.value = null;
    try {
      const nextAnalysis = await api.getPackageAnalysis(packageId);
      if (!disposed && requestId === loadRequestId) analysis.value = nextAnalysis;
    } catch (error) {
      if (!disposed && requestId === loadRequestId) {
        loadError.value = extractErrorMessage(error, '套餐分析加载失败，请稍后重试');
      }
    } finally {
      if (requestId === loadRequestId) loading.value = false;
    }
  };
  onMounted(() => void load());
  onScopeDispose(() => {
    disposed = true;
    loadRequestId += 1;
    loading.value = false;
  }, true);
  return { loading, loadError, analysis, pkg, scoreOption, formatInventoryTrend, goBack, load };
}
