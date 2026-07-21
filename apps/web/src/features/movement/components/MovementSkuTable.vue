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
      <el-table-column label="操作" width="100" align="right" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" size="small" text @click="$emit('analyze', row.packageId)">
            分析
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-row">
      <el-button size="small" :disabled="page <= 1" @click="$emit('prev')">上一页</el-button>
      <span class="page-info">第 {{ page }} 页</span>
      <el-button size="small" :disabled="!hasMore" @click="$emit('next')">下一页</el-button>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { MovementSkuRow } from '../../../services/api/movement.api';
import MovementSkuColumns from './MovementSkuColumns.vue';
defineProps<{
  rows: MovementSkuRow[];
  listLoading: boolean;
  emptyText: string;
  page: number;
  hasMore: boolean;
  rowClass: (args: { row: MovementSkuRow }) => string;
}>();
defineEmits<{ analyze: [packageId: string]; prev: []; next: [] }>();
</script>
