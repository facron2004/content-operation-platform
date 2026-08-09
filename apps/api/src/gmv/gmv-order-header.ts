/** Compatibility barrel for OrderHeader-backed GMV projections and persistence. */
export { type OrderLike } from './gmv-order-header.types';
export { upsertOrderHeaderIso, batchUpsertOrderHeaders } from './gmv-order-header.upsert';
export {
  queryOrderHeaderGmv,
  queryOrderHeaderRefund,
  queryOrderHeaderHourly,
  loadOrderHeaderAreaDistribution,
  loadOrderHeaderCategoryDistribution
} from './gmv-order-header.query';
export {
  buildOrderHeaderTodayPayload,
  computeFromOrderHeader,
  computeHourlyFromOrderHeader
} from './gmv-order-header-today';
export { mapOrderHeaderTrendRows, computeTrendFromOrderHeader } from './gmv-order-header-trend';
export { computeDistributionFromOrderHeader } from './gmv-order-header-distribution';
