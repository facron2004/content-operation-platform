import { computed, onScopeDispose, ref } from 'vue';
import {
  getMerchantHeatmap,
  type MerchantHeatmapResponse
} from '../../../services/api/merchant.api';
import { extractErrorMessage } from '../../../services/http-client';

export type IntensityMode = 'count' | 'gmv';

export function useMerchantHeatmap() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const data = ref<MerchantHeatmapResponse | null>(null);
  const intensityMode = ref<IntensityMode>('count');
  let disposed = false;
  let requestId = 0;

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

  async function load(): Promise<void> {
    if (disposed || loading.value) return;
    const currentRequestId = ++requestId;
    loading.value = true;
    error.value = null;
    try {
      const nextData = await getMerchantHeatmap();
      if (disposed || currentRequestId !== requestId) return;
      data.value = nextData;
    } catch (e) {
      if (!disposed && currentRequestId === requestId) {
        error.value = extractErrorMessage(e, '加载热力图数据失败，请稍后重试');
      }
    } finally {
      if (!disposed && currentRequestId === requestId) loading.value = false;
    }
  }

  function toggleMode() {
    if (disposed) return;
    intensityMode.value = intensityMode.value === 'count' ? 'gmv' : 'count';
  }

  function isActive(): boolean {
    return !disposed;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    requestId += 1;
    loading.value = false;
  }

  onScopeDispose(dispose);

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
    toggleMode,
    isActive
  };
}
