<script setup lang="ts">
import { computed } from 'vue';
import type { ZeroSalesSkuRow } from '../composables/useZeroSales';
import ZeroSalesSkuColumns from './ZeroSalesSkuColumns.vue';
import AppleButton from '../../../components/AppleButton.vue';
const props = withDefaults(
  defineProps<{
    rows: ZeroSalesSkuRow[];
    loading: boolean;
    page: number;
    hasMore: boolean;
    rowClassName: (data: { row: ZeroSalesSkuRow }) => string;
    // Residual #266: ZERO_SALES_SKUS_CACHE_CAP honesty.
    truncated?: boolean;
    limit?: number | null;
  }>(),
  {
    truncated: false,
    limit: null
  }
);
const limitLabel = computed(() =>
  typeof props.limit === 'number' && props.limit > 0 ? props.limit : 1000
);
const emit = defineEmits<{
  prev: [];
  next: [];
  analysis: [packageId: string];
  generate: [packageId: string];
  // Residual #211: open stock/sales timeline drawer for this SKU.
  timeline: [row: ZeroSalesSkuRow];
}>();
</script>
<template>
  <section class="panel">
    <!-- Residual #266: ZERO_SALES_SKUS_CACHE_CAP honesty. -->
    <p v-if="truncated" class="list-cap-hint">
      列表仅加载前 {{ limitLabel }} 条
      SKU（缓存头）；分页在该上限内切换。可用筛选/搜索收窄范围，或用 CSV 导出（同样有上限）。
    </p>
    <el-table
      v-loading="loading"
      :data="rows"
      size="small"
      empty-text="暂无零动销 SKU"
      :row-class-name="rowClassName"
    >
      <ZeroSalesSkuColumns />
      <!-- Residual #211: ops column wider for 时间线 + 查看分析 + AI 改写. -->
      <el-table-column label="操作" width="260" align="right" fixed="right">
        <template #default="{ row }">
          <div class="action-cell">
            <AppleButton variant="ghost" size="sm" @click="emit('timeline', row)">
              时间线
            </AppleButton>
            <AppleButton variant="ghost" size="sm" @click="emit('analysis', row.packageId)">
              查看分析
            </AppleButton>
            <AppleButton size="sm" variant="quiet" @click="emit('generate', row.packageId)">
              AI 改写
            </AppleButton>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-row">
      <AppleButton size="sm" variant="secondary" :disabled="page <= 1" @click="emit('prev')">
        上一页
      </AppleButton>
      <span class="page-info">第 {{ page }} 页</span>
      <AppleButton size="sm" variant="secondary" :disabled="!hasMore" @click="emit('next')">
        下一页
      </AppleButton>
    </div>
  </section>
</template>
<style scoped>
.action-cell {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  flex-wrap: wrap;
}
.list-cap-hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fffbeb;
  border-radius: 4px;
  padding: 4px 8px;
}
</style>
