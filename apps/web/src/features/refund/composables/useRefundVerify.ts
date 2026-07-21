import type { TopMerchantRow } from '../../../services/api/refund.api';
import { formatGmv, formatNumber, formatPercent } from '../../../utils/format';
import { bindRefundVerifyLoaders, createRefundVerifyState } from './refund-verify-core';
import { merchantRateClass, refundVerifyRowClass } from './refund-verify-ui';

export function useRefundVerify() {
  const state = createRefundVerifyState();
  const loaders = bindRefundVerifyLoaders(state);
  return {
    ...state,
    ...loaders,
    rowClass: ({ row }: { row: TopMerchantRow }) =>
      refundVerifyRowClass(row, state.activeTab.value),
    rateClass: merchantRateClass,
    formatGmv,
    formatNumber,
    formatPercent
  };
}
