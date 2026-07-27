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
    summary: state.summary,
    trend: state.trend,
    ranking: state.ranking
  });
  const { loadRanking, reload } = createMerchantSalesLoaders(state);
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
      loadError: state.loadError,
      kpiDate: state.kpiDate,
      reload,
      loadRanking
    }),
    ...merchantSalesFormatters
  };
}

export function useMerchantSalesPage() {
  return reactive(useMerchantSales());
}
