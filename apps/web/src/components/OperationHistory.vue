<template>
  <el-dialog v-model="visible" title="操作历史" width="800px" :close-on-click-modal="false">
    <div class="history-controls">
      <el-input v-model="searchText" placeholder="搜索操作..." clearable class="search-input">
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-select v-model="filterType" placeholder="筛选类型" clearable class="filter-select">
        <el-option label="处理预警" value="alert_resolve" />
        <el-option label="批量处理" value="alert_batch_resolve" />
        <el-option label="生成文案" value="copy_generate" />
        <el-option label="审核文案" value="copy_audit" />
        <el-option label="更新配置" value="config_update" />
      </el-select>
      <div class="history-spacer" />
      <el-button @click="exportCSV">导出 CSV</el-button>
      <el-button type="danger" @click="clearHistory">清空历史</el-button>
    </div>

    <el-table :data="filteredRecords" height="400" class="history-table">
      <el-table-column label="时间" width="160">
        <template #default="{ row }">
          {{ formatTime(row.timestamp) }}
        </template>
      </el-table-column>
      <el-table-column label="类型" width="120">
        <template #default="{ row }">
          <el-tag size="small">{{ getTypeLabel(row.type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" prop="action" min-width="200" show-overflow-tooltip />
      <el-table-column label="结果" width="80">
        <template #default="{ row }">
          <el-tag :type="row.result === 'success' ? 'success' : 'danger'" size="small">
            {{ row.result === 'success' ? '成功' : '失败' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="详情" width="100">
        <template #default="{ row }">
          <el-button size="small" text @click="showDetails(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="history-stats">
      <span>总计 {{ records.length }} 条记录</span>
      <span>成功 {{ successCount }}</span>
      <span>失败 {{ errorCount }}</span>
    </div>
  </el-dialog>

  <el-dialog v-model="detailsVisible" title="操作详情" width="600px">
    <div v-if="selectedRecord" class="details-content">
      <p>
        <strong>时间:</strong>
        {{ formatTime(selectedRecord.timestamp) }}
      </p>
      <p>
        <strong>类型:</strong>
        {{ getTypeLabel(selectedRecord.type) }}
      </p>
      <p>
        <strong>操作:</strong>
        {{ selectedRecord.action }}
      </p>
      <p>
        <strong>结果:</strong>
        {{ selectedRecord.result === 'success' ? '成功' : '失败' }}
      </p>
      <p v-if="selectedRecord.error">
        <strong>错误:</strong>
        {{ selectedRecord.error }}
      </p>
      <div>
        <strong>详细信息:</strong>
        <pre>{{ JSON.stringify(selectedRecord.details, null, 2) }}</pre>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import {
  useOperationHistory,
  operationHistory,
  type OperationRecord
} from '../services/operation-history';

const visible = defineModel<boolean>('visible', { default: false });

const { getAll, clear, exportToCSV } = useOperationHistory();

const records = ref<OperationRecord[]>(getAll());
const searchText = ref('');
const filterType = ref('');
const detailsVisible = ref(false);
const selectedRecord = ref<OperationRecord | null>(null);

const filteredRecords = computed(() => {
  let result = records.value;

  if (filterType.value) {
    result = result.filter((r) => r.type === filterType.value);
  }

  if (searchText.value) {
    const search = searchText.value.toLowerCase();
    result = result.filter(
      (r) =>
        r.action.toLowerCase().includes(search) ||
        JSON.stringify(r.details).toLowerCase().includes(search)
    );
  }

  return result;
});

const successCount = computed(() => records.value.filter((r) => r.result === 'success').length);
const errorCount = computed(() => records.value.filter((r) => r.result === 'error').length);

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN');
}

const { getTypeLabel } = operationHistory;

function showDetails(record: OperationRecord) {
  selectedRecord.value = record;
  detailsVisible.value = true;
}

function exportCSV() {
  try {
    const csv = exportToCSV();
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `操作历史_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    ElMessage.success('导出成功');
  } catch {
    ElMessage.error('导出失败');
  }
}

async function clearHistory() {
  try {
    await ElMessageBox.confirm('确定要清空所有操作历史吗？此操作不可恢复。', '警告', {
      type: 'warning'
    });
    clear();
    records.value = [];
    ElMessage.success('已清空操作历史');
  } catch {
    // 用户取消
  }
}

function refresh() {
  records.value = getAll();
}

defineExpose({ refresh });
</script>

<style scoped>
.history-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search-input {
  width: 300px;
}

.filter-select {
  width: 150px;
}

.history-spacer {
  flex: 1;
}

.history-table {
  margin-top: 16px;
}

.history-stats {
  display: flex;
  gap: 24px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--soft);
  color: var(--ink-soft);
  font-size: 13px;
}

.details-content p {
  margin: 8px 0;
  line-height: 1.6;
}

.details-content pre {
  padding: 12px;
  border-radius: 6px;
  background: var(--soft);
  overflow-x: auto;
  font-size: 12px;
}

@media (max-width: 960px) {
  .search-input,
  .filter-select {
    width: 100%;
  }

  .history-spacer {
    display: none;
  }

  .history-stats {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
