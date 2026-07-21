import type { Channel, PromotionLevel } from './package-types';
import type { OperationTag } from './operation-tag-types';
export interface OperationCard {
  packageId: string;
  packageName: string;
  merchantName: string;
  areaName: string;
  category: string;
  stockLeft: number;
  currentPrice: number;
  score: number;
  level: PromotionLevel;
  tags: OperationTag[];
  reason: string;
  nextAction: string;
  recommendedChannels: Channel[];
}
