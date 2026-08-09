import { reactive } from 'vue';
import { createMerchantSalesState, mountMerchantSalesReload } from './merchant-sales-core';
import {
  createMerchantSalesHandlers,
  createMerchantSalesLoaders,
  merchantSalesFormatters,
  useMerchantSalesDerived
} from './merchant-sales-ui';

export function useMerchantSales() {
  const state = createMerchantSalesState();
  const derived = useMerchantSalesDerived({
    windowSel: state.windowSel,
    kpiDate: state.kpiDate,
    summary: state.summary,
    trend: state.trend,
    ranking: state.ranking
  });
  const { loadRanking, reload, forceRefresh } = createMerchantSalesLoaders(state);
  mountMerchantSalesReload(reload);
  return {
    ...state,
    ...derived,
    reload,
    loadRanking,
    ...createMerchantSalesHandlers({
      page: state.page,
      pageSize: state.pageSize,
      windowSel: state.windowSel,
      sortBy: state.sortBy,
      exporting: state.exporting,
      kpiDate: state.kpiDate,
      reload,
      loadRanking,
      forceRefresh
    }),
    ...merchantSalesFormatters
  };
}

export function useMerchantSalesPage() {
  return reactive(useMerchantSales());
}
