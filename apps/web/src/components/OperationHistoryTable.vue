<template>
  <el-table :data="filteredRecords" height="400" class="history-table">
    <el-table-column label="时间" width="160">
      <template #default="{ row }">{{ formatTime(row.timestamp) }}</template>
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
        <el-button size="small" text @click="$emit('show-details', row)">查看</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>
<script setup lang="ts">
import type { OperationRecord } from '../services/operation-history';
defineProps<{
  filteredRecords: OperationRecord[];
  formatTime: (t: number) => string;
  getTypeLabel: (type: OperationRecord['type']) => string;
}>();
defineEmits<{ 'show-details': [row: OperationRecord] }>();
</script>
