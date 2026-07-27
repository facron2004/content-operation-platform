import { ref, onMounted } from 'vue';
import { api } from '../../../services/api';

/** Residual #213: platform content-funnel counters from GET /content/dashboard/summary. */
export interface ContentFunnelSummary {
  generatedCount: number;
  approvedCount: number;
  pushedCount: number;
  pendingCount: number;
  riskCount: number;
  totalClickCount: number;
  totalOrderCount: number;
  totalVerifyCount: number;
  totalGmv: number;
  contentConversionRate: number;
  verifyConversionRate: number;
  /** Residual #261: INTERACTIVE_LIST_MAX_DAYS window from API (optional pre-upgrade). */
  dateFrom?: string;
  dateTo?: string;
}

export const emptyContentFunnel: ContentFunnelSummary = {
  generatedCount: 0,
  approvedCount: 0,
  pushedCount: 0,
  pendingCount: 0,
  riskCount: 0,
  totalClickCount: 0,
  totalOrderCount: 0,
  totalVerifyCount: 0,
  totalGmv: 0,
  contentConversionRate: 0,
  verifyConversionRate: 0
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function mapSummary(raw: Record<string, unknown> | null | undefined): ContentFunnelSummary {
  if (!raw || typeof raw !== 'object') return { ...emptyContentFunnel };
  return {
    generatedCount: num(raw.generatedCount),
    approvedCount: num(raw.approvedCount),
    pushedCount: num(raw.pushedCount),
    pendingCount: num(raw.pendingCount),
    riskCount: num(raw.riskCount),
    totalClickCount: num(raw.totalClickCount),
    totalOrderCount: num(raw.totalOrderCount),
    totalVerifyCount: num(raw.totalVerifyCount),
    totalGmv: num(raw.totalGmv),
    contentConversionRate: num(raw.contentConversionRate),
    verifyConversionRate: num(raw.verifyConversionRate),
    // Residual #261: surface API window bounds for funnel title.
    dateFrom: str(raw.dateFrom),
    dateTo: str(raw.dateTo)
  };
}

/**
 * Soft-fail load of platform content funnel. Scoped actors get zeros from API —
 * still safe to render (tiles show 0).
 */
export function useContentFunnel() {
  const loading = ref(false);
  const funnel = ref<ContentFunnelSummary>({ ...emptyContentFunnel });

  async function load() {
    loading.value = true;
    try {
      const data = await api.getDashboardSummary();
      funnel.value = mapSummary(data as Record<string, unknown>);
    } catch {
      funnel.value = { ...emptyContentFunnel };
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);

  return { loading, funnel, load };
}
