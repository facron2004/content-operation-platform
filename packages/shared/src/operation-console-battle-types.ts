import type { Channel } from './package-types';
export interface BattleCard {
  packageId: string;
  packageName: string;
  generatedAt: string;
  recommendationReason: string;
  targetAudience: string[];
  suitableChannels: Channel[];
  recommendedPushTime: string;
  mainSellingPoints: string[];
  riskTips: string[];
  communityCopy: string;
  momentsCopy: string;
  merchantShareCopy: string;
  followUpCopy: string;
  soldOutFallbackCopy: string;
}
