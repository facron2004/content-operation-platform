<script setup lang="ts">
import type { ZeroSalesMerchantRow } from '../composables/useZeroSales';
import ZeroSalesMerchantColumns from './ZeroSalesMerchantColumns.vue';
defineProps<{
  rows: ZeroSalesMerchantRow[];
  loading: boolean;
  rowClassName: (data: { row: ZeroSalesMerchantRow }) => string;
}>();
defineEmits<{ drill: [merchantId: string] }>();
</script>
<template>
  <el-table
    v-loading="loading"
    :data="rows"
    size="small"
    empty-text="暂无零动销商家"
    :row-class-name="rowClassName"
  >
    <ZeroSalesMerchantColumns @drill="$emit('drill', $event)" />
  </el-table>
</template>
