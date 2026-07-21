<template>
  <el-dialog v-model="visible" title="操作历史" width="800px" :close-on-click-modal="false">
    <OperationHistoryList
      v-model:search-text="searchText"
      v-model:filter-type="filterType"
      :records="records"
      :filtered-records="filteredRecords"
      :success-count="successCount"
      :error-count="errorCount"
      :format-time="formatTime"
      :get-type-label="getTypeLabel"
      @export="exportCSV"
      @clear="clearHistory"
      @show-details="showDetails"
    />
  </el-dialog>
  <OperationHistoryDetails
    v-model="detailsVisible"
    :record="selectedRecord"
    :format-time="formatTime"
    :get-type-label="getTypeLabel"
  />
</template>
<script setup lang="ts">
import { useOperationHistoryDialog } from '../composables/useOperationHistoryDialog';
import OperationHistoryList from './OperationHistoryList.vue';
import OperationHistoryDetails from './OperationHistoryDetails.vue';
const visible = defineModel<boolean>('visible', { default: false });
const {
  records,
  searchText,
  filterType,
  detailsVisible,
  selectedRecord,
  filteredRecords,
  successCount,
  errorCount,
  formatTime,
  getTypeLabel,
  showDetails,
  exportCSV,
  clearHistory,
  refresh
} = useOperationHistoryDialog();
defineExpose({ refresh });
</script>
<style src="../styles/components/operation-history.css" scoped></style>
