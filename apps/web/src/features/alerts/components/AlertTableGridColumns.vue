<template>
  <el-table-column label="级" width="72" sortable>
    <template #default="{ row }">
      <el-tag :type="row.level === 'danger' ? 'danger' : 'warning'" effect="plain" size="small">
        {{ row.priorityScore ?? 0 }}
      </el-tag>
    </template>
  </el-table-column>
  <el-table-column label="等级" width="68">
    <template #default="{ row }">
      <el-tag :type="riskTagType(row.level)" effect="dark" size="small">
        {{ levelText(row.level) }}
      </el-tag>
    </template>
  </el-table-column>
  <el-table-column label="类型" width="90">
    <template #default="{ row }">{{ alertTypeLabels[row.type] ?? row.type }}</template>
  </el-table-column>
  <el-table-column prop="packageName" label="套餐" min-width="160" show-overflow-tooltip />
  <el-table-column prop="merchantName" label="商家" min-width="110" show-overflow-tooltip />
  <el-table-column prop="areaName" label="区域" width="68" />
  <el-table-column prop="reason" label="触发原因" min-width="150" show-overflow-tooltip />
  <el-table-column prop="action" label="下一步动作" min-width="150" show-overflow-tooltip />
  <el-table-column label="操作" width="150" fixed="right">
    <template #default="{ row }">
      <el-button size="small" type="primary" @click="$emit('open-detail', row)">处理卡</el-button>
      <el-button size="small" @click="$emit('resolve', row.alertId)">标记处理</el-button>
    </template>
  </el-table-column>
</template>
<script setup lang="ts">
import type { OperationAlert } from '@content/shared';
import { alertTypeLabels, riskTagType, levelText } from '../../../utils/labels';
defineEmits<{
  'open-detail': [alert: OperationAlert & { priorityScore?: number }];
  resolve: [alertId: string];
}>();
</script>
