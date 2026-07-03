<script setup lang="ts">
// 通用表格分页 —— 替代各 view/component 重复的 el-pagination 模板。
// 支持两种用法:
// 1. 受控(无 v-model):父组件维护 pagination 对象,通过 @page-change / @size-change 处理。
// 2. 双向绑定:父组件用 v-model:page / v-model:page-size 接管后,仍可监听 @page-change 触发刷新。
import type { PaginationMeta } from '@content/shared';

const props = withDefaults(
  defineProps<{
    // 父组件只需提供 page/pageSize/total;totalPages 由组件内部按需推导。
    pagination: Omit<PaginationMeta, 'totalPages'>;
    pageSizes?: number[];
    layout?: string;
    showTotal?: boolean;
  }>(),
  {
    pageSizes: () => [30, 50, 100],
    layout: 'total, sizes, prev, pager, next',
    showTotal: true
  }
);

const emit = defineEmits<{
  'page-change': [page: number];
  'size-change': [pageSize: number];
}>();

const onCurrentChange = (page: number) => emit('page-change', page);
const onSizeChange = (size: number) => emit('size-change', size);
</script>

<template>
  <div class="pagination-footer">
    <span v-if="showTotal" class="muted-cell">共 {{ props.pagination.total }} 条</span>
    <el-pagination
      :current-page="props.pagination.page"
      :page-size="props.pagination.pageSize"
      :page-sizes="props.pageSizes"
      :layout="props.layout"
      :total="props.pagination.total"
      @current-change="onCurrentChange"
      @size-change="onSizeChange"
    />
  </div>
</template>

<style scoped>
.pagination-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
}
</style>
