<template>
  <div>
    <el-table
      v-loading="listLoading"
      :data="rows"
      size="small"
      :empty-text="emptyText"
      :row-class-name="rowClass"
    >
      <MovementSkuColumns />
      <!-- Residual #210: ops column wider for 时间线 + 分析. -->
      <el-table-column label="操作" width="160" align="right" fixed="right">
        <template #default="{ row }">
          <div class="action-cell">
            <AppleButton variant="ghost" size="sm" @click="$emit('timeline', row)">
              时间线
            </AppleButton>
            <AppleButton variant="ghost" size="sm" @click="$emit('analyze', row.packageId)">
              分析
            </AppleButton>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <!-- Residual #266: MOVEMENT_CACHE_CAP honesty. -->
    <p v-if="truncated" class="list-cap-hint">
      列表仅加载前 {{ limitLabel }} 条 SKU（缓存头）；分页在该上限内切换。可用筛选/搜索收窄范围。
    </p>
    <div class="pagination-row">
      <AppleButton size="sm" variant="secondary" :disabled="page <= 1" @click="$emit('prev')">
        上一页
      </AppleButton>
      <span class="page-info">第 {{ page }} 页</span>
      <AppleButton size="sm" variant="secondary" :disabled="!hasMore" @click="$emit('next')">
        下一页
      </AppleButton>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { MovementSkuRow } from '../../../services/api/movement.api';
import MovementSkuColumns from './MovementSkuColumns.vue';
import AppleButton from '../../../components/AppleButton.vue';
const props = withDefaults(
  defineProps<{
    rows: MovementSkuRow[];
    listLoading: boolean;
    emptyText: string;
    page: number;
    hasMore: boolean;
    rowClass: (args: { row: MovementSkuRow }) => string;
    // Residual #266: MOVEMENT_CACHE_CAP honesty.
    truncated?: boolean;
    limit?: number | null;
  }>(),
  {
    truncated: false,
    limit: null
  }
);
const limitLabel = computed(() =>
  typeof props.limit === 'number' && props.limit > 0 ? props.limit : 2000
);
defineEmits<{
  analyze: [packageId: string];
  // Residual #210: open stock/sales timeline drawer for this SKU.
  timeline: [row: MovementSkuRow];
  prev: [];
  next: [];
}>();
</script>
<style scoped>
.action-cell {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  flex-wrap: wrap;
}
.list-cap-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fffbeb;
  border-radius: 4px;
  padding: 4px 8px;
}
</style>
