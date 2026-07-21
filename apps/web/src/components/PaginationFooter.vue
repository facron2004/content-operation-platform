<script setup lang="ts">
import type { PaginationMeta } from '@content/shared';
const props = withDefaults(
  defineProps<{
    pagination: Omit<PaginationMeta, 'totalPages'>;
    pageSizes?: number[];
    layout?: string;
    showTotal?: boolean;
  }>(),
  { pageSizes: () => [30, 50, 100], layout: 'total, sizes, prev, pager, next', showTotal: true }
);
const emit = defineEmits<{ 'page-change': [page: number]; 'size-change': [pageSize: number] }>();
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
      @current-change="(page: number) => emit('page-change', page)"
      @size-change="(size: number) => emit('size-change', size)"
    />
  </div>
</template>
<style src="../styles/components/pagination-footer.css" scoped></style>
