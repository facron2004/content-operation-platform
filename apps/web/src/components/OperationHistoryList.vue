<template>
  <div>
    <OperationHistoryControls
      v-model:search-text="searchText"
      v-model:filter-type="filterType"
      @export="$emit('export')"
      @clear="$emit('clear')"
    />
    <OperationHistoryTable
      :filtered-records="filteredRecords"
      :format-time="formatTime"
      :get-type-label="getTypeLabel"
      @show-details="$emit('show-details', $event)"
    />
    <div class="history-stats">
      <span>总计 {{ records.length }} 条记录</span>
      <span>成功 {{ successCount }}</span>
      <span>失败 {{ errorCount }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { OperationRecord } from '../services/operation-history';
import OperationHistoryControls from './OperationHistoryControls.vue';
import OperationHistoryTable from './OperationHistoryTable.vue';
defineProps<{
  records: OperationRecord[];
  filteredRecords: OperationRecord[];
  successCount: number;
  errorCount: number;
  formatTime: (timestamp: number) => string;
  getTypeLabel: (type: OperationRecord['type']) => string;
}>();
const searchText = defineModel<string>('searchText', { default: '' }),
  filterType = defineModel<string>('filterType', { default: '' });
defineEmits<{ export: []; clear: []; 'show-details': [row: OperationRecord] }>();
</script>
