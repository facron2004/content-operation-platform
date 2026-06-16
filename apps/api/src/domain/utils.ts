import type { PromotionLevel } from '@content/shared';

/** 将数值限制在 [min, max] 范围内 */
export const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

/** 根据推广分计算等级 */
export const scoreLevel = (score: number): PromotionLevel => {
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'C';
  return 'D';
};
