import type { ContentPackage } from '@content/shared';
import {
  inventoryTagType,
  operationTagType,
  salesTagType,
  statusLabels
} from '../../utils/labels';
import { displayMoney } from '../../utils/format';

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
    original: displayMoney(target, 'originalPrice'),
    current: displayMoney(
      target,
      target.temporarySalePrice != null ? 'temporarySalePrice' : 'salePrice'
    ),
    welfare: displayMoney(target, 'welfarePrice')
  };
}
