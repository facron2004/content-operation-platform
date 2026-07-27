import type { Channel } from './package-types';
import type { OperationCard } from './operation-alert-card-types';
export interface DailyOperationReview {
  date: string;
  whatHappened: string[];
  goodPackages: OperationCard[];
  weakPackages: OperationCard[];
  highConversionCopies: Array<{
    contentId: string;
    title: string;
    channel: Channel;
    conversionRate: number;
    orderCount: number;
  }>;
  valuableCommunities: Array<{
    groupId: string;
    groupName: string;
    conversionRate: number;
    reason: string;
  }>;
  tomorrowSuggestions: string[];
  /**
   * Residual #282: daily-review Top-N list-head honesty — package/copy/community
   * arrays are clipped; matched counts power narrative + SPA banners.
   */
  reviewListLimit?: number;
  goodMatched?: number;
  goodTruncated?: boolean;
  weakMatched?: number;
  weakTruncated?: boolean;
  copyMatched?: number;
  copyTruncated?: boolean;
  communityMatched?: number;
  communityTruncated?: boolean;
}
