<template>
  <el-drawer
    v-model="visible"
    title="操作历史"
    :size="drawerSize"
    direction="rtl"
    append-to-body
    destroy-on-close
    class="operation-history-drawer"
    @open="refresh"
  >
    <ErrorAlert :message="exportError" />
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
  </el-drawer>
  <OperationHistoryDetails
    v-model="detailsVisible"
    :record="selectedRecord"
    :format-time="formatTime"
    :get-type-label="getTypeLabel"
  />
</template>
<script setup lang="ts">
import { useOperationHistoryDialog } from '../composables/useOperationHistoryDialog';
import { useResponsiveDrawerSize } from '../composables/useResponsiveDrawerSize';
import ErrorAlert from './ErrorAlert.vue';
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
  exportError,
  formatTime,
  getTypeLabel,
  showDetails,
  exportCSV,
  clearHistory,
  refresh
} = useOperationHistoryDialog();
const { drawerSize } = useResponsiveDrawerSize('440px');
defineExpose({ refresh });
</script>
<style src="../styles/components/operation-history.css"></style>
