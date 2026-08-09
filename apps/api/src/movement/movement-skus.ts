/**
 * Compatibility entry point for movement SKU loading and projection helpers.
 * Keep existing imports stable while the responsibilities live in focused modules.
 */
export {
  fetchMovingPackageIds,
  loadActiveSkus,
  loadRecentSalesByPackage
} from './movement-sku-loaders';
export type { ActiveSkuSalesWindow } from './movement-sku-loaders';
export {
  assembleSkuRows,
  computeSkuRows,
  mapMovementSkuRows,
  paginateMovementSkuRows,
  sortMovementSkuRows
} from './movement-sku-projection';
