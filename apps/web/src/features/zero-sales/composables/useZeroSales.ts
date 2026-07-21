import { onMounted, watch } from 'vue';
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
  return createZeroSalesController({
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
}
