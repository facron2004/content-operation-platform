import client from '../http-client';

export type DataAnalysisWindow = 'day' | 'week' | 'month' | 'year';

export interface DataAnalysisOverview {
  orderCount: number;
  salesAmount: number;
  walletAmount: number;
  tradeAmount: number;
  netGmv: number;
  writeOffAmount: number;
  faceAmount: number;
  refundAmount: number;
  verifyAmount: number;
  verifyRate: number;
  refundRate: number;
  settlementRate: number;
  avgOrderValue: number;
  targetRatio: number;
  targetRatioWithWallet: number;
  netGmvTargetRatio: number;
  verifiedCount: number;
  pendingVerifyCount: number;
  expiredCount: number;
  merchantCount: number;
  salesmanCount: number;
}

export interface DataAnalysisDeltas {
  orderCount: number | null;
  salesAmount: number | null;
  tradeAmount: number | null;
  netGmv: number | null;
  writeOffAmount: number | null;
  refundAmount: number | null;
  verifyRate: number | null;
  refundRate: number | null;
  settlementRate: number | null;
  avgOrderValue: number | null;
}

export interface DataAnalysisDailyPoint {
  date: string;
  salesAmount: number;
  tradeAmount: number;
  netGmv: number;
  writeOffAmount: number;
  orderCount: number;
  refundAmount: number;
}

export interface DataAnalysisChannelSlice {
  channel: string;
  label: string;
  salesAmount: number;
  orderCount: number;
  share: number;
}

export interface DataAnalysisPackageRankRow {
  rank: number;
  packageId: string;
  packageName: string;
  salesAmount: number;
  orderCount: number;
}

export type DataAnalysisSnapshotKey = 'today' | 'yesterday' | 'last7' | 'last30';

export interface DataAnalysisWindowSnapshot {
  key: DataAnalysisSnapshotKey;
  label: string;
  start: string;
  end: string;
  overview: DataAnalysisOverview;
}

export interface DataAnalysisTimeSlotRow {
  label: string;
  orderCount: number;
  salesAmount: number;
  verifiedCount: number;
  verifyRate: number;
}

export interface DataAnalysisHourlyRow {
  hour: number;
  orderCount: number;
  salesAmount: number;
}

export interface DataAnalysisRankRow {
  rank: number;
  name: string;
  orderCount: number;
  salesAmount: number;
  faceAmount: number;
  walletAmount: number;
  refundAmount: number;
  verifiedCount: number;
  verifyRate: number;
  avgOrderValue: number;
}

export interface DataAnalysisRateRow {
  name: string;
  orderCount: number;
  verifyRate: number;
}

export interface DataAnalysisRefundRow {
  name: string;
  orderCount: number;
  refundAmount: number;
  verifyRate: number;
}

export interface DataAnalysisSheetMeta {
  key: string;
  title: string;
  status: 'ready' | 'placeholder';
}

export interface DataAnalysisSummary {
  window: DataAnalysisWindow;
  date: string;
  endDate: string;
  previousStart: string;
  previousEnd: string;
  templateReady: boolean;
  overview: DataAnalysisOverview;
  previousOverview: DataAnalysisOverview;
  deltas: DataAnalysisDeltas;
  daily: DataAnalysisDailyPoint[];
  channels: DataAnalysisChannelSlice[];
  packages: DataAnalysisPackageRankRow[];
  windowSnapshots: DataAnalysisWindowSnapshot[];
  merchantCount: number;
  salesmanCount: number;
  detailCount: number;
  detailTruncated: boolean;
  /** Residual #279: interactive UI panel caps (Excel keeps full rankingLimit). */
  rankingLimit?: number;
  rankingTruncated?: boolean;
  refundLimit?: number;
  refundTruncated?: boolean;
  packageLimit?: number;
  packageTruncated?: boolean;
  limitations: string[];
  sheets: DataAnalysisSheetMeta[];
  timeSlots: DataAnalysisTimeSlotRow[];
  hourly: DataAnalysisHourlyRow[];
  salesmen: DataAnalysisRankRow[];
  merchants: DataAnalysisRankRow[];
  merchantVerifyLow: DataAnalysisRateRow[];
  merchantVerifyHigh: DataAnalysisRateRow[];
  salesmanVerifyLow: DataAnalysisRateRow[];
  salesmanVerifyHigh: DataAnalysisRateRow[];
  merchantRefunds: DataAnalysisRefundRow[];
  salesmanRefunds: DataAnalysisRefundRow[];
}

export interface GetDataAnalysisSummaryParams {
  window: DataAnalysisWindow;
  date?: string;
  endDate?: string;
  detailLimit?: number;
  rankingLimit?: number;
}

export async function getDataAnalysisSummary(params: GetDataAnalysisSummaryParams) {
  return (
    await client.get<DataAnalysisSummary>('/data-analysis/summary', {
      params: {
        window: params.window,
        ...(params.date ? { date: params.date } : {}),
        ...(params.endDate ? { endDate: params.endDate } : {}),
        ...(params.detailLimit ? { detailLimit: params.detailLimit } : {}),
        ...(params.rankingLimit ? { rankingLimit: params.rankingLimit } : {})
      }
    })
  ).data;
}

/** Relative path for axios client (baseURL already includes /api). */
export function getDataAnalysisExportUrl(params: GetDataAnalysisSummaryParams) {
  const q = new URLSearchParams();
  q.set('window', params.window);
  if (params.date) q.set('date', params.date);
  if (params.endDate) q.set('endDate', params.endDate);
  if (params.detailLimit) q.set('detailLimit', String(params.detailLimit));
  if (params.rankingLimit) q.set('rankingLimit', String(params.rankingLimit));
  // No `_` cache-buster: the export DTO uses forbidNonWhitelisted, so an unknown
  // query param returns 400. The backend already sends Cache-Control: no-store.
  return `/data-analysis/export?${q.toString()}`;
}
