<script setup lang="ts">
import type { OperationAlert, PaginationMeta } from '@content/shared';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useAlertTableSummary } from '../composables/useAlerts';
import AlertTableGrid from './AlertTableGrid.vue';
import AlertTableHeader from './AlertTableHeader.vue';

export type AlertTableProps = {
  alerts: (OperationAlert & { priorityScore?: number })[];
  pagination:
    Omit<PaginationMeta, 'totalPages'> | { page: number; pageSize: number; total: number };
  resolving: boolean;
};
const props = defineProps<AlertTableProps>();
defineEmits<{
  'open-detail': [alert: OperationAlert & { priorityScore?: number }];
  resolve: [alertId: string];
  'resolve-page': [];
  'page-change': [page: number];
  'size-change': [pageSize: number];
}>();
const {
  currentPageDangerCount,
  currentPageWarningCount,
  currentPageAvgScore,
  currentPagePackageCount,
  alertRowClassName
} = useAlertTableSummary(() => props.alerts);
</script>
<template>
  <section class="panel alert-table-panel">
    <AlertTableHeader
      :total="pagination.total"
      :page-count="alerts.length"
      :resolving="resolving"
      :current-page-danger-count="currentPageDangerCount"
      :current-page-warning-count="currentPageWarningCount"
      :current-page-avg-score="currentPageAvgScore"
      :current-page-package-count="currentPagePackageCount"
      @resolve-page="$emit('resolve-page')"
    />
    <AlertTableGrid
      :alerts="alerts"
      :alert-row-class-name="alertRowClassName"
      @open-detail="$emit('open-detail', $event)"
      @resolve="$emit('resolve', $event)"
    />
    <PaginationFooter
      :pagination="pagination"
      :page-sizes="[50, 80, 120]"
      @page-change="$emit('page-change', $event)"
      @size-change="$emit('size-change', $event)"
    />
  </section>
</template>
<style src="../../../styles/components/alert-table.css" scoped></style>
