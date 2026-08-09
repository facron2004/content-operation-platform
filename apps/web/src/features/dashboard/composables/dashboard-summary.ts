/** Residual #213/#291: pure contract mapping for dashboard content funnel data. */
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
  /** Residual #291: recommendation-head coverage for status/top-package data. */
  sourceMatchedCount?: number;
  sourceLimit?: number;
  sourceTruncated?: boolean;
  /** Recommendation source failure is partial data, not a successful empty head. */
  sourceError?: string;
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
  verifyConversionRate: 0,
  sourceMatchedCount: 0,
  sourceLimit: 0,
  sourceTruncated: false,
  sourceError: undefined
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function mapContentFunnelSummary(
  raw: Record<string, unknown> | null | undefined
): ContentFunnelSummary {
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
    dateTo: str(raw.dateTo),
    // Residual #291: preserve source coverage so the summary never implies a
    // complete status distribution when recommendations were capped.
    sourceMatchedCount: num(raw.sourceMatchedCount),
    sourceLimit: num(raw.sourceLimit),
    sourceTruncated: raw.sourceTruncated === true,
    sourceError: str(raw.sourceError)
  };
}
