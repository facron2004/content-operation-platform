<template>
  <el-tabs :model-value="modelValue" class="zs-tabs" @tab-change="$emit('tab-change', $event)">
    <el-tab-pane label="商家" name="merchant">
      <ZeroSalesMerchantTable
        :rows="merchantRows"
        :loading="merchantLoading"
        :page="merchantPage"
        :has-more="merchantHasMore"
        :truncated="merchantTruncated"
        :limit="merchantLimit"
        :row-class-name="merchantRowClass"
        @prev="$emit('prev-merchant')"
        @next="$emit('next-merchant')"
        @drill="$emit('drill', $event)"
      />
    </el-tab-pane>
    <el-tab-pane label="商品" name="sku">
      <ZeroSalesSkuTable
        :rows="skuRows"
        :loading="skuLoading"
        :page="skuPage"
        :has-more="skuHasMore"
        :truncated="skuTruncated"
        :limit="skuLimit"
        :row-class-name="skuRowClass"
        @prev="$emit('prev-sku')"
        @next="$emit('next-sku')"
        @analysis="$emit('analysis', $event)"
        @generate="$emit('generate', $event)"
        @timeline="$emit('timeline', $event)"
      />
    </el-tab-pane>
  </el-tabs>
</template>
<script setup lang="ts">
import ZeroSalesMerchantTable from './ZeroSalesMerchantTable.vue';
import ZeroSalesSkuTable from './ZeroSalesSkuTable.vue';

import type { ZeroSalesMerchantRow, ZeroSalesSkuRow } from '../../../services/api/zero-sales.api';
export type ZeroSalesTabsProps = {
  modelValue: string;
  merchantRows: ZeroSalesMerchantRow[];
  merchantLoading: boolean;
  merchantPage: number;
  merchantHasMore: boolean;
  // Residual #266: ZERO_SALES_MERCHANTS_CACHE_CAP honesty.
  merchantTruncated?: boolean;
  merchantLimit?: number | null;
  skuRows: ZeroSalesSkuRow[];
  skuLoading: boolean;
  skuPage: number;
  skuHasMore: boolean;
  // Residual #266: ZERO_SALES_SKUS_CACHE_CAP honesty.
  skuTruncated?: boolean;
  skuLimit?: number | null;
  merchantRowClass: (data: { row: ZeroSalesMerchantRow }) => string;
  skuRowClass: (data: { row: ZeroSalesSkuRow }) => string;
};
defineProps<ZeroSalesTabsProps>();
defineEmits<{
  'update:modelValue': [value: string];
  'tab-change': [name: string | number];
  'prev-merchant': [];
  'next-merchant': [];
  'prev-sku': [];
  'next-sku': [];
  drill: [merchantId: string];
  analysis: [packageId: string];
  generate: [packageId: string];
  // Residual #211: bubble timeline open to page body.
  timeline: [row: ZeroSalesSkuRow];
}>();
</script>
