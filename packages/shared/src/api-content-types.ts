import type { CommunityGroup } from './domain-types';
export type {
  CopiesResponse,
  GenerateCopiesResponse,
  PerformanceResponse
} from './api-content-performance-types';
export interface CommunitiesResponse {
  items: CommunityGroup[];
}
export interface CookieStatusResponse {
  hasCookie: boolean;
  maskedCookie: string | null;
  isValid: boolean;
  username: string | null;
  failedAttempts: number;
  cooldownMinutes: number;
  lastLoginTime: string | null;
}
export interface CookieUpdateResponse {
  success: boolean;
  error?: string;
}
