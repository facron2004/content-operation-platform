<script setup lang="ts">
import type { ZeroSalesSkuRow } from '../composables/useZeroSales';
import ZeroSalesSkuColumns from './ZeroSalesSkuColumns.vue';
defineProps<{
  rows: ZeroSalesSkuRow[];
  loading: boolean;
  page: number;
  hasMore: boolean;
  rowClassName: (data: { row: ZeroSalesSkuRow }) => string;
}>();
const emit = defineEmits<{
  prev: [];
  next: [];
  analysis: [packageId: string];
  generate: [packageId: string];
}>();
</script>
<template>
  <section class="panel">
    <el-table
      v-loading="loading"
      :data="rows"
      size="small"
      empty-text="暂无零动销 SKU"
      :row-class-name="rowClassName"
    >
      <ZeroSalesSkuColumns />
      <el-table-column label="操作" width="200" align="right" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" size="small" text @click="emit('analysis', row.packageId)">
            查看分析
          </el-button>
          <el-button size="small" text @click="emit('generate', row.packageId)">AI 改写</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-row">
      <el-button size="small" :disabled="page <= 1" @click="emit('prev')">上一页</el-button>
      <span class="page-info">第 {{ page }} 页</span>
      <el-button size="small" :disabled="!hasMore" @click="emit('next')">下一页</el-button>
    </div>
  </section>
</template>
