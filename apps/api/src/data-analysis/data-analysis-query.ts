/** Compatibility facade for the layered data-analysis query modules. */
export {
  buildDeltas,
  deltaRatio,
  queryChannelBreakdown,
  queryOverview
} from './data-analysis-overview.query';
export { queryDailyTrend, queryHourly, queryTimeSlots } from './data-analysis-trend.query';

/** Ranking queries live in a dedicated layer; keep this facade for import compatibility. */
export {
  mergePackageRankingByName,
  queryMerchantRanking,
  queryMerchantRefunds,
  queryMerchantVerifyExtremes,
  queryPackageRanking,
  querySalesmanRanking,
  querySalesmanRefunds,
  querySalesmanVerifyExtremes,
  resolvePackageDisplayName
} from './data-analysis-ranking.query';

/** Detail queries live in a dedicated layer; keep this facade for import compatibility. */
export { queryOrderDetails } from './data-analysis-detail.query';
