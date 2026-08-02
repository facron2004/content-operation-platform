import { ref, computed } from 'vue';
import {
  getMerchantHeatmap,
  type MerchantHeatmapResponse
} from '../../../services/api/merchant.api';

export type IntensityMode = 'count' | 'gmv';

export function useMerchantHeatmap() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const data = ref<MerchantHeatmapResponse | null>(null);
  const intensityMode = ref<IntensityMode>('count');

  const points = computed(() => {
    if (!data.value) return [];
    const pts = data.value.points;
    if (intensityMode.value === 'gmv') {
      const maxGmv = Math.max(...pts.map((p) => p.totalGmv), 1);
      return pts.map((p) => ({
        ...p,
        intensity: p.totalGmv / maxGmv
      }));
    }
    return pts;
  });

  const heatmapLayerData = computed(() => {
    return points.value.map((p) => [p.lat, p.lng, p.intensity] as [number, number, number]);
  });

  const totalMerchants = computed(() => data.value?.totalMerchants ?? 0);
  const mappedMerchants = computed(() => data.value?.mappedMerchants ?? 0);
  const unmappedMerchants = computed(() => data.value?.unmappedMerchants ?? 0);
  const center = computed(() => data.value?.center ?? { lat: 30.572, lng: 104.066 });
  // Residual #269: PLATFORM_SCAN_LIMIT honesty.
  const truncated = computed(() => Boolean(data.value?.truncated));
  const limit = computed(() => data.value?.limit ?? null);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      data.value = await getMerchantHeatmap();
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载热力图数据失败';
    } finally {
      loading.value = false;
    }
  }

  function toggleMode() {
    intensityMode.value = intensityMode.value === 'count' ? 'gmv' : 'count';
  }

  return {
    loading,
    error,
    data,
    points,
    heatmapLayerData,
    totalMerchants,
    mappedMerchants,
    unmappedMerchants,
    center,
    // Residual #269
    truncated,
    limit,
    intensityMode,
    load,
    toggleMode
  };
}
