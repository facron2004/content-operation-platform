import type { ContentPackage } from '@content/shared';
import {
  formatMoney,
  inventoryTagType,
  operationTagType,
  salesTagType,
  statusLabels
} from '../../utils/labels';

export type PackageAnalysisHeroData = {
  status: string;
  inventoryFlag?: string | null;
  inventoryFlagLevel?: string | null;
  inventoryFlagLabel?: string | null;
  inventorySalesLabel?: string | null;
  inventorySalesLevel?: string | null;
  inventoryBacklogDays?: number | null;
  operationTags?: Array<{ key: string; label: string; level: string }>;
};
export type PackageHeroProps = { pkg: ContentPackage; analysis: PackageAnalysisHeroData };

export const analysisStatusLabel = (status: string) => statusLabels[status] ?? status;
export const inventoryFlagTagType = (level: string | null | undefined) =>
  inventoryTagType(level as never);
export const salesFlagTagType = (level: string | null | undefined) => salesTagType(level as never);
export const operationFlagTagType = (level: string) => operationTagType(level as never);

export function buildPackagePriceDisplay(target: ContentPackage | undefined) {
  if (!target) return { original: '-', current: '-', welfare: '-' };
  return {
    original: formatMoney(target.originalPrice),
    current: formatMoney(target.temporarySalePrice ?? target.salePrice),
    welfare: formatMoney(target.welfarePrice ?? undefined)
  };
}
