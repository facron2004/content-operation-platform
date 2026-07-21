import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  operationHistory,
  useOperationHistory,
  type OperationRecord
} from '../services/operation-history';

export function filterOperationRecords(
  records: OperationRecord[],
  filterType: string,
  searchText: string
): OperationRecord[] {
  let result = records;
  if (filterType) result = result.filter((r) => r.type === filterType);
  if (searchText) {
    const search = searchText.toLowerCase();
    result = result.filter(
      (r) =>
        r.action.toLowerCase().includes(search) ||
        JSON.stringify(r.details).toLowerCase().includes(search)
    );
  }
  return result;
}

export function exportOperationHistoryCsv(exportToCSV: () => string): void {
  try {
    const csv = exportToCSV(),
      blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `操作历史_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    ElMessage.success('导出成功');
  } catch {
    ElMessage.error('导出失败');
  }
}
export async function clearOperationHistory(
  clear: () => void,
  setRecords: (records: OperationRecord[]) => void
): Promise<void> {
  try {
    await ElMessageBox.confirm('确定要清空所有操作历史吗？此操作不可恢复。', '警告', {
      type: 'warning'
    });
    clear();
    setRecords([]);
    ElMessage.success('已清空操作历史');
  } catch {
    /* 用户取消 */
  }
}

export function useOperationHistoryDialog() {
  const { getAll, clear, exportToCSV } = useOperationHistory();
  const records = ref<OperationRecord[]>(getAll()),
    searchText = ref(''),
    filterType = ref(''),
    detailsVisible = ref(false),
    selectedRecord = ref<OperationRecord | null>(null);
  return {
    records,
    searchText,
    filterType,
    detailsVisible,
    selectedRecord,
    filteredRecords: computed(() =>
      filterOperationRecords(records.value, filterType.value, searchText.value)
    ),
    successCount: computed(() => records.value.filter((r) => r.result === 'success').length),
    errorCount: computed(() => records.value.filter((r) => r.result === 'error').length),
    formatTime: (timestamp: number) => new Date(timestamp).toLocaleString('zh-CN'),
    getTypeLabel: operationHistory.getTypeLabel,
    showDetails: (record: OperationRecord) => {
      selectedRecord.value = record;
      detailsVisible.value = true;
    },
    exportCSV: () => exportOperationHistoryCsv(exportToCSV),
    clearHistory: () => clearOperationHistory(clear, (next) => (records.value = next)),
    refresh: () => {
      records.value = getAll();
    }
  };
}
