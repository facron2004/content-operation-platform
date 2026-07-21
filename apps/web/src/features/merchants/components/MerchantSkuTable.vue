<template>
  <section class="panel">
    <header class="section-head">
      <h4>该商家 SKU（{{ skuList.length }}）</h4>
      <el-button type="primary" size="small" text @click="emit('go-zero-sales')">
        查看零动销 SKU
      </el-button>
    </header>
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
import MerchantSkuTableColumns from './MerchantSkuTableColumns.vue';
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
}>();
const emit = defineEmits<{
  (e: 'go-zero-sales'): void;
  (e: 'go-analysis', packageId: string): void;
}>();
</script>
