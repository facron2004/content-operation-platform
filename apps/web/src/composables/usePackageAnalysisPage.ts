import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ContentPackage } from '@content/shared';
import { api, type PackageAnalysisResponse } from '../services/api';

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
    analysis = ref<PackageAnalysisResponse>({} as PackageAnalysisResponse);
  const pkg = computed<ContentPackage | undefined>(() => analysis.value.package),
    scoreOption = computed(() => buildPackageScoreOption(analysis.value));
  const formatInventoryTrend = formatInventoryTrendPoints,
    goBack = () => router.push('/recommendations');
  const load = async () => {
    loading.value = true;
    try {
      analysis.value = await api.getPackageAnalysis(packageId);
    } finally {
      loading.value = false;
    }
  };
  onMounted(load);
  return { loading, analysis, pkg, scoreOption, formatInventoryTrend, goBack, load };
}
