<template>
  <div class="history-controls">
    <el-input
      v-model="searchText"
      placeholder="搜索操作..."
      clearable
      class="search-input"
      size="default"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
    </el-input>
    <el-select
      v-model="filterType"
      placeholder="全部类型"
      clearable
      class="filter-select"
      size="default"
    >
      <el-option
        v-for="option in typeOptions"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </el-select>
  </div>
</template>
<script setup lang="ts">
import { Search } from '@element-plus/icons-vue';
import type { OperationRecord } from '../services/operation-history';

const typeOptions: Array<{ label: string; value: OperationRecord['type'] }> = [
  { label: '处理预警', value: 'alert_resolve' },
  { label: '批量处理', value: 'alert_batch_resolve' },
  { label: '生成文案', value: 'copy_generate' },
  { label: '审核文案', value: 'copy_audit' },
  { label: '更新配置', value: 'config_update' },
  { label: '创建任务', value: 'task_create' },
  { label: '确认发布', value: 'task_publish' },
  { label: '标记失败', value: 'task_fail' },
  { label: '创建活动', value: 'campaign_create' }
];

const searchText = defineModel<string>('searchText', { default: '' }),
  filterType = defineModel<string>('filterType', { default: '' });
</script>
