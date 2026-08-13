<script setup lang="ts">
import type { OperationAlert, PaginationMeta } from '@content/shared';
import AlertFilters from './AlertFilters.vue';
import AlertTable from './AlertTable.vue';
defineProps<{
  filters: { keyword: string; level: string; type: string; date: string };
  alerts: (OperationAlert & { priorityScore?: number })[];
  pagination:
    Omit<PaginationMeta, 'totalPages'> | { page: number; pageSize: number; total: number };
  resolving: boolean;
  canResolve: boolean;
}>();
defineEmits<{
  'update:keyword': [value: string];
  'update:level': [value: string];
  'update:type': [value: string];
  'update:date': [value: string];
  clear: [];
  'open-detail': [alert: OperationAlert & { priorityScore?: number }];
  resolve: [alertId: string];
  'resolve-page': [];
  'page-change': [page: number];
  'size-change': [pageSize: number];
}>();
</script>
<template>
  <AlertFilters
    :filters="filters"
    @update:keyword="$emit('update:keyword', $event)"
    @update:level="$emit('update:level', $event)"
    @update:type="$emit('update:type', $event)"
    @update:date="$emit('update:date', $event)"
    @clear="$emit('clear')"
  />
  <AlertTable
    :alerts="alerts"
    :pagination="pagination"
    :resolving="resolving"
    :can-resolve="canResolve"
    @open-detail="$emit('open-detail', $event)"
    @resolve="$emit('resolve', $event)"
    @resolve-page="$emit('resolve-page')"
    @page-change="$emit('page-change', $event)"
    @size-change="$emit('size-change', $event)"
  />
</template>
