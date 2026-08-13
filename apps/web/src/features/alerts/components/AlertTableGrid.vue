<template>
  <el-table
    :data="alerts"
    height="620"
    empty-text="暂无待处理预警"
    class="alert-table"
    :row-class-name="alertRowClassName"
  >
    <AlertTableGridColumns
      :can-resolve="canResolve"
      @open-detail="$emit('open-detail', $event)"
      @resolve="$emit('resolve', $event)"
    />
  </el-table>
</template>
<script setup lang="ts">
import type { OperationAlert } from '@content/shared';
import AlertTableGridColumns from './AlertTableGridColumns.vue';
type AlertRow = OperationAlert & { priorityScore?: number };
defineProps<{
  alerts: AlertRow[];
  alertRowClassName: (args: { row: AlertRow }) => string;
  canResolve: boolean;
}>();
defineEmits<{ 'open-detail': [alert: AlertRow]; resolve: [alertId: string] }>();
</script>
