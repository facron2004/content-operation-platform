import { onMounted, onScopeDispose, ref } from 'vue';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';
import { emptyContentFunnel, mapContentFunnelSummary } from './dashboard-summary';
import type { ContentFunnelSummary } from './dashboard-summary';

export { emptyContentFunnel, mapContentFunnelSummary } from './dashboard-summary';
export type { ContentFunnelSummary } from './dashboard-summary';

type LegacyDashboardSummaryContract = Pick<
  ContentFunnelSummary,
  'generatedCount' | 'pendingCount' | 'totalGmv' | 'contentConversionRate'
> & {
  dateFrom?: string;
  dateTo?: string;
};

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function mapSummary(
  raw: Record<string, unknown> | null | undefined
): ContentFunnelSummary & LegacyDashboardSummaryContract {
  const summary = mapContentFunnelSummary(raw);
  if (!raw || typeof raw !== 'object') return summary;
  return {
    ...summary,
    dateFrom: str(raw.dateFrom),
    dateTo: str(raw.dateTo)
  };
}

/** Scoped actors may legitimately receive zeroes; transport failures remain visible. */
export function useContentFunnel() {
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const funnel = ref<ContentFunnelSummary>({ ...emptyContentFunnel });
  const requestId = ref(0);
  let disposed = false;

  onScopeDispose(() => {
    disposed = true;
    requestId.value += 1;
    loading.value = false;
  }, true);

  async function load() {
    if (disposed) return;
    const currentRequestId = ++requestId.value;
    loading.value = true;
    loadError.value = null;
    try {
      const data = await api.getDashboardSummary();
      if (disposed || currentRequestId !== requestId.value) return;
      funnel.value = mapSummary(data as Record<string, unknown>);
    } catch (error) {
      if (disposed || currentRequestId !== requestId.value) return;
      loadError.value = extractErrorMessage(error, '内容漏斗加载失败，请稍后重试');
    } finally {
      if (!disposed && currentRequestId === requestId.value) loading.value = false;
    }
  }

  onMounted(() => {
    void load();
  });

  return { loading, loadError, funnel, load };
}
