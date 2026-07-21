<template>
  <section class="panel">
    <div class="panel-head">
      <h2>审核队列</h2>
      <el-segmented :model-value="status" :options="statusOptions" @change="onStatusChange" />
    </div>
    <TableSkeleton v-if="loading && copies.length === 0" :rows="10" :columns="5" />
    <AuditQueueTable
      v-else
      :copies="copies"
      :channel-labels="channelLabels"
      @select="emit('select', $event)"
    />
  </section>
</template>
<script setup lang="ts">
import type { GeneratedCopy } from '@content/shared';
import TableSkeleton from '../../../components/TableSkeleton.vue';
import AuditQueueTable from './AuditQueueTable.vue';
defineProps<{
  loading: boolean;
  status: string;
  copies: GeneratedCopy[];
  statusOptions: unknown[];
  channelLabels: Record<string, string>;
}>();
const emit = defineEmits<{
  'update:status': [value: string];
  load: [];
  select: [row: GeneratedCopy];
}>();
function onStatusChange(value: string | number | boolean) {
  emit('update:status', String(value));
  emit('load');
}
</script>
