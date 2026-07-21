import type { Channel } from './package-types';
import type { OperationCard } from './operation-alert-card-types';
export type { DailyOperationReview } from './operation-console-review-types';
export interface CommunityGroup {
  groupId: string;
  groupName: string;
  areaId: string;
  areaName: string;
  groupType: 'office' | 'parent_child' | 'foodie' | 'merchant' | 'wellness' | 'mixed';
  memberCount: number;
  activityScore: number;
  historicalConversionRate: number;
  preferredCategories: string[];
  todayRecommendedPackages: OperationCard[];
}
export interface CommunityPushTask {
  taskId: string;
  groupId: string;
  groupName: string;
  areaName: string;
  packageId: string;
  packageName: string;
  channel: Channel;
  plannedTime: string;
  reason: string;
  nextAction: string;
}
