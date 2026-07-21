<script setup lang="ts">
import type { RecommendPackageItem } from '@content/shared';
import EmptyState from '../../../components/EmptyState.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import TableSkeleton from '../../../components/TableSkeleton.vue';
import RecommendationsTableColumns from './RecommendationsTableColumns.vue';
defineProps<{ loading: boolean; items: RecommendPackageItem[]; pagination: unknown }>();
defineEmits<{
  load: [force?: boolean];
  'page-change': [];
  'size-change': [];
  clear: [];
  analysis: [row: RecommendPackageItem];
  generate: [packageId: string];
  'create-task': [packageId: string];
}>();
</script>
<template>
  <section class="panel">
    <TableSkeleton v-if="loading && items.length === 0" :rows="10" :columns="9" />
    <el-table
      v-else
      :data="items"
      height="520"
      :default-sort="{ prop: 'stockLeft', order: 'descending' }"
      @row-dblclick="$emit('analysis', $event)"
    >
      <RecommendationsTableColumns
        @analysis="$emit('analysis', $event)"
        @generate="$emit('generate', $event)"
        @create-task="$emit('create-task', $event)"
      />
      <template #empty>
        <EmptyState
          icon="🔍"
          title="暂无推荐套餐"
          description="当前筛选条件下没有找到符合的套餐，试试调整筛选条件"
          action-text="清空筛选"
          @action="$emit('clear')"
        />
      </template>
    </el-table>
    <PaginationFooter
      :pagination="pagination as never"
      :page-sizes="[30, 50, 100]"
      @page-change="$emit('page-change')"
      @size-change="$emit('size-change')"
    />
  </section>
</template>
<style src="../../../styles/components/recommendations-table.css" scoped></style>
