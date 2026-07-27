<template>
  <section class="panel">
    <header class="section-head">
      <!-- Residual #250: append + when server LIMIT truncated the list. -->
      <h4>该商家 SKU（{{ skuList.length }}{{ truncated ? '+' : '' }}）</h4>
      <AppleButton variant="ghost" size="sm" @click="emit('go-zero-sales')">
        查看零动销 SKU
      </AppleButton>
    </header>
    <p v-if="truncated" class="sku-cap-hint">
      仅展示前 {{ limitLabel }} 个 SKU（按未动销天数排序）；完整清单请用「查看零动销
      SKU」或动销列表。
    </p>
    <el-table :data="skuList" size="small" max-height="320">
      <MerchantSkuTableColumns
        :stale-color="staleColor"
        :stale-label="staleLabel"
        @go-analysis="emit('go-analysis', $event)"
      />
    </el-table>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import MerchantSkuTableColumns from './MerchantSkuTableColumns.vue';
import AppleButton from '../../../components/AppleButton.vue';
const props = withDefaults(
  defineProps<{
    skuList: Array<{
      packageId: string;
      packageName: string;
      category: string;
      salePrice: number;
      stockLeft: number;
      lastSalesDate?: string | null;
      daysSinceLastSale?: number;
      staleBucket: string;
    }>;
    staleColor: (bucket: string) => string;
    staleLabel: (bucket: string) => string;
    // Residual #250: listSkus LIMIT honesty.
    truncated?: boolean;
    limit?: number | null;
  }>(),
  {
    truncated: false,
    limit: null
  }
);
const limitLabel = computed(() =>
  typeof props.limit === 'number' && props.limit > 0 ? props.limit : props.skuList.length
);
const emit = defineEmits<{
  (e: 'go-zero-sales'): void;
  (e: 'go-analysis', packageId: string): void;
}>();
</script>
<style scoped>
.sku-cap-hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary, #909399);
}
</style>
