import { onActivated, onDeactivated, onMounted, onScopeDispose, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  STALE_BUCKETS,
  STALE_BUCKET_COLORS,
  STALE_BUCKET_LABELS,
  type StaleBucket,
  type ZeroSalesMerchantRow,
  type ZeroSalesSkuRow
} from '../../../services/api/zero-sales.api';
import { createZeroSalesController } from './zero-sales-ops';
export { STALE_BUCKETS, STALE_BUCKET_COLORS, STALE_BUCKET_LABELS };
export type { StaleBucket, ZeroSalesMerchantRow, ZeroSalesSkuRow };
export function useZeroSales() {
  const route = useRoute(),
    router = useRouter();
  const controller = createZeroSalesController({
    routeQuery: route.query,
    router,
    onMounted: (cb) => onMounted(cb),
    watchQuery: (cb) => {
      watch(
        () => route.query,
        (q) => cb(q)
      );
    }
  });
  onActivated(() => {
    void controller.resume();
  });
  onDeactivated(controller.pause);
  onScopeDispose(controller.dispose);
  return controller;
}
