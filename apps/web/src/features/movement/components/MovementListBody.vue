<template>
  <section class="panel movement-list-panel">
    <el-tabs :model-value="activeTab" @tab-change="onTabChange">
      <el-tab-pane label="不动销 SKU" name="stagnant" />
      <el-tab-pane label="动销 SKU" name="moving" />
    </el-tabs>
    <MovementFilterBar
      :active-tab="activeTab"
      :filters="filters"
      @reload-list="$emit('reload-list')"
      @export-csv="$emit('export-csv')"
    />
    <MovementSkuTable
      :rows="rows"
      :list-loading="listLoading"
      :empty-text="emptyText"
      :page="page"
      :has-more="hasMore"
      :truncated="truncated"
      :limit="limit"
      :row-class="rowClass"
      @analyze="$emit('analyze', $event)"
      @timeline="$emit('timeline', $event)"
      @prev="$emit('prev')"
      @next="$emit('next')"
    />
  </section>
</template>
<script setup lang="ts">
import MovementSkuTable from './MovementSkuTable.vue';
import MovementFilterBar from './MovementFilterBar.vue';

import type { MovementSkuRow } from '../../../services/api/movement.api';
import type { StaleBucket } from '../composables/useMovementList';
export type MovementListBodyProps = {
  activeTab: string;
  filters: {
    bucket: StaleBucket;
    days: 1 | 7 | 30;
    search?: string;
    sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
  };
  rows: MovementSkuRow[];
  listLoading: boolean;
  emptyText: string;
  page: number;
  hasMore: boolean;
  rowClass: (args: { row: MovementSkuRow }) => string;
  // Residual #266: MOVEMENT_CACHE_CAP honesty.
  truncated?: boolean;
  limit?: number | null;
};
defineProps<MovementListBodyProps>();
const emit = defineEmits<{
  'update:activeTab': [value: string];
  'tab-change': [];
  'reload-list': [];
  'export-csv': [];
  analyze: [packageId: string];
  // Residual #210: bubble timeline open to list view.
  timeline: [row: MovementSkuRow];
  prev: [];
  next: [];
}>();
function onTabChange(value: string | number | boolean) {
  emit('update:activeTab', String(value));
  emit('tab-change');
}
</script>
