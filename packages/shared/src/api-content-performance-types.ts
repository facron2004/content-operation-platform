import type { GeneratedCopy } from './domain-types';
export interface CopiesResponse {
  items: GeneratedCopy[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
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
  };
}
