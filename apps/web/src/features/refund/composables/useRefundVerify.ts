import type { TopMerchantRow } from '../../../services/api/refund.api';
import { useRoute } from 'vue-router';
import { watch } from 'vue';
import { formatGmv, formatNumber, formatPercent } from '../../../utils/format';
import { bindRefundVerifyLoaders, createRefundVerifyState } from './refund-verify-core';
import { merchantRateClass, refundVerifyRowClass } from './refund-verify-ui';

export function useRefundVerify() {
  const route = useRoute();
  const state = createRefundVerifyState();
  state.activeTab.value = route.path.startsWith('/verifications') ? 'verify' : 'refund';
  const loaders = bindRefundVerifyLoaders(state);
  watch(
    () => route.path,
    (path) => {
      const nextTab = path.startsWith('/verifications') ? 'verify' : 'refund';
      if (state.activeTab.value === nextTab) return;
      state.activeTab.value = nextTab;
      void loaders.reload();
    }
  );
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
