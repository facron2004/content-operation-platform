<script setup lang="ts">
import type { ZeroSalesMerchantRow } from '../composables/useZeroSales';
import ZeroSalesMerchantTableBody from './ZeroSalesMerchantTableBody.vue';
defineProps<{
  rows: ZeroSalesMerchantRow[];
  loading: boolean;
  page: number;
  hasMore: boolean;
  rowClassName: (data: { row: ZeroSalesMerchantRow }) => string;
}>();
const emit = defineEmits<{ prev: []; next: []; drill: [merchantId: string] }>();
</script>
<template>
  <section class="panel">
    <ZeroSalesMerchantTableBody
      :rows="rows"
      :loading="loading"
      :row-class-name="rowClassName"
      @drill="emit('drill', $event)"
    />
    <div class="pagination-row">
      <el-button size="small" :disabled="page <= 1" @click="emit('prev')">上一页</el-button>
      <span class="page-info">第 {{ page }} 页</span>
      <el-button size="small" :disabled="!hasMore" @click="emit('next')">下一页</el-button>
    </div>
  </section>
</template>
