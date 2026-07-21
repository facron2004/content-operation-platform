import type { Channel, PackageStatus, PromotionLevel, StrategyType } from './package-types';
export interface PromotionScore {
  packageId: string;
  areaId: string;
  score: number;
  level: PromotionLevel;
  status: PackageStatus;
  recommendedStrategy: StrategyType;
  reason: string;
  riskTips: string[];
  recommendedChannels: Channel[];
  copyAngles: string[];
  calculatedAt: string;
}
export interface ScoreDimension {
  key: string;
  label: string;
  score: number;
  weight: number;
  reason: string;
}
export interface PackageScoreBreakdown {
  totalScore: number;
  level: PromotionLevel;
  dimensions: ScoreDimension[];
  reasons: string[];
}
