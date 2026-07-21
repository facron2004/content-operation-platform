<template>
  <div class="task-filter-bar">
    <el-input
      :model-value="modelValue.keyword"
      placeholder="搜索任务标题 / ID"
      clearable
      class="filter-keyword"
      @update:model-value="patch({ keyword: String($event ?? '') })"
      @keyup.enter="emit('search')"
      @clear="emit('search')"
    />
    <el-select
      :model-value="modelValue.status"
      placeholder="全部状态"
      clearable
      class="filter-select"
      @update:model-value="patch({ status: String($event ?? '') })"
    >
      <el-option
        v-for="opt in statusOptions"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>
    <el-select
      :model-value="modelValue.channel"
      placeholder="全部渠道"
      clearable
      class="filter-select"
      @update:model-value="patch({ channel: String($event ?? '') })"
    >
      <el-option
        v-for="opt in channelOptions"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>
    <el-select
      :model-value="modelValue.priority"
      placeholder="全部优先级"
      clearable
      class="filter-select"
      @update:model-value="patch({ priority: String($event ?? '') })"
    >
      <el-option
        v-for="opt in priorityOptions"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>
    <el-button type="primary" :icon="Search" @click="emit('search')">搜索</el-button>
  </div>
</template>

<script setup lang="ts">
import { Search } from '@element-plus/icons-vue';
import type { TaskStatus, TaskChannel, TaskPriority } from '@content/shared';
import type { TaskFilters } from '../composables/useTaskCenter';

const props = defineProps<{
  modelValue: TaskFilters;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: TaskFilters];
  search: [];
}>();

const statusOptions: Array<{ label: string; value: TaskStatus }> = [
  { label: '草稿', value: 'draft' },
  { label: '待审核', value: 'waiting_audit' },
  { label: '已排期', value: 'scheduled' },
  { label: '已发布', value: 'published' },
  { label: '已完成', value: 'completed' },
  { label: '已逾期', value: 'overdue' },
  { label: '已失败', value: 'failed' },
  { label: '已取消', value: 'cancelled' },
  { label: '已阻塞', value: 'blocked' }
];

const channelOptions: Array<{ label: string; value: TaskChannel }> = [
  { label: '微信群', value: 'wechat_group' },
  { label: '朋友圈', value: 'moments' },
  { label: '商家转发', value: 'merchant_share' }
];

const priorityOptions: Array<{ label: string; value: TaskPriority }> = [
  { label: '紧急', value: 'urgent' },
  { label: '普通', value: 'normal' },
  { label: '低优先级', value: 'low' }
];

function patch(partial: Partial<TaskFilters>) {
  emit('update:modelValue', { ...props.modelValue, ...partial });
}
</script>

<style scoped>
.task-filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.filter-keyword {
  width: 240px;
}

.filter-select {
  width: 150px;
}
</style>
