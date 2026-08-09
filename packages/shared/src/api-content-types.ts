import type { CommunityGroup } from './domain-types';
export type {
  CopiesResponse,
  GenerateCopiesResponse,
  PerformanceResponse
} from './api-content-performance-types';
export interface CommunitiesResponse {
  items: CommunityGroup[];
  /**
   * Residual #278: RECOMMEND_CACHE_CAP source honesty — derived groups come from
   * the capped recommend head, not the full selling catalog.
   */
  sourceMatchedCount?: number;
  sourceLimit?: number;
  sourceTruncated?: boolean;
  /**
   * Residual #278: MAX_DERIVED_COMMUNITY_INPUT_PACKAGES second-clip honesty —
   * only the top-N scored packages feed group derivation.
   */
  inputLimit?: number;
  inputLoaded?: number;
  inputTruncated?: boolean;
  /**
   * Residual #281: MAX_DERIVED_COMMUNITY_GROUPS output-cap honesty —
   * only the top-N activity groups are returned.
   */
  groupMatched?: number;
  groupLimit?: number;
  groupTruncated?: boolean;
}
export interface CookieStatusResponse {
  hasCookie: boolean;
  /** @deprecated Cookie name recon; no longer returned by the API. */
  maskedCookie?: string | null;
  isValid: boolean;
  username: string | null;
  /** @deprecated Lockout-threshold recon; no longer returned by the API. */
  failedAttempts?: number;
  cooldownMinutes: number;
  lastLoginTime: string | null;
  state?: 'ready' | 'pending_config' | 'authentication_required';
  missingConfig?: string[];
}
export interface CookieUpdateResponse {
  success: boolean;
  error?: string;
}
