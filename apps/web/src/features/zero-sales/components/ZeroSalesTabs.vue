<template>
  <el-tabs :model-value="modelValue" class="zs-tabs" @tab-change="$emit('tab-change', $event)">
    <el-tab-pane label="商家" name="merchant">
      <ZeroSalesMerchantTable
        :rows="merchantRows"
        :loading="merchantLoading"
        :page="merchantPage"
        :has-more="merchantHasMore"
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
        :row-class-name="skuRowClass"
        @prev="$emit('prev-sku')"
        @next="$emit('next-sku')"
        @analysis="$emit('analysis', $event)"
        @generate="$emit('generate', $event)"
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
  skuRows: ZeroSalesSkuRow[];
  skuLoading: boolean;
  skuPage: number;
  skuHasMore: boolean;
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
}>();
</script>
