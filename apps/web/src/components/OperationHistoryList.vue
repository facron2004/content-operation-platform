<template>
  <div class="history-panel">
    <div class="history-header">
      <div>
        <strong>本地操作记录</strong>
        <p>记录本机最近的运营动作，便于回溯与导出。</p>
      </div>
      <div class="history-header-actions">
        <AppleButton size="sm" variant="quiet" @click="$emit('export')">导出</AppleButton>
        <AppleButton size="sm" variant="ghost" data-tone="danger" @click="$emit('clear')">
          清空
        </AppleButton>
      </div>
    </div>

    <OperationHistoryControls v-model:search-text="searchText" v-model:filter-type="filterType" />

    <div class="history-stats">
      <span class="stat-pill">总计 {{ records.length }}</span>
      <span class="stat-pill is-success">成功 {{ successCount }}</span>
      <span class="stat-pill is-danger">失败 {{ errorCount }}</span>
      <span v-if="filteredRecords.length !== records.length" class="stat-pill is-muted">
        当前 {{ filteredRecords.length }}
      </span>
    </div>

    <OperationHistoryTable
      :filtered-records="filteredRecords"
      :format-time="formatTime"
      :get-type-label="getTypeLabel"
      @show-details="$emit('show-details', $event)"
    />
  </div>
</template>
<script setup lang="ts">
import type { OperationRecord } from '../services/operation-history';
import OperationHistoryControls from './OperationHistoryControls.vue';
import OperationHistoryTable from './OperationHistoryTable.vue';
import AppleButton from './AppleButton.vue';
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
