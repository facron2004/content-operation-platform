import type { GeneratedCopy } from './domain-types';
export interface CopiesResponse {
  items: GeneratedCopy[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    /** Trailing interactive window (Beijing day keys) when list is date-capped. */
    dateFrom?: string;
    dateTo?: string;
  };
}
export interface GenerateCopiesResponse {
  contentList: GeneratedCopy[];
}
export interface PerformanceResponse {
  items: Array<{
    contentId: string;
    title: string;
    copyVersion: string;
    channel: string;
    clickCount: number;
    orderCount: number;
    verifyCount: number;
    refundCount: number;
    gmv: number;
    conversionRate: number;
  }>;
  versionComparison: Array<{
    copyVersion: string;
    titleDirection: string;
    clickCount: number;
    orderCount: number;
    verifyCount: number;
    conversionRate: number;
  }>;
  review: {
    date: string;
    whatHappened: string[];
    tomorrowSuggestions: string[];
    highConversionCopies: Array<{ contentId: string; title: string; conversionRate: number }>;
    /** Residual #282: Top-N high-conversion copy head honesty. */
    reviewListLimit?: number;
    copyMatched?: number;
    copyTruncated?: boolean;
  };
  /**
   * Residual #277: RECOMMEND_CACHE_CAP source honesty — performance items/review
   * are derived from the capped recommend head, not the full selling catalog.
   */
  sourceMatchedCount?: number;
  sourceLimit?: number;
  sourceTruncated?: boolean;
  /**
   * Residual #284: DASHBOARD_COPY_PERF_TAKE honesty — items + versionComparison
   * are the global newest CopyPerformance head, not the full performance catalog.
   */
  itemsLimit?: number;
  itemsLoaded?: number;
  itemsTruncated?: boolean;
  /**
   * Residual #286: DASHBOARD_GENERATED_COPY_TAKE honesty — title/version join
   * uses the global newest GeneratedCopy head; missing joins render as '-'.
   */
  titleJoinLimit?: number;
  titleJoinLoaded?: number;
  titleJoinTruncated?: boolean;
  /** Count of performance items whose contentId missed the GeneratedCopy head. */
  titleJoinMissed?: number;
}
