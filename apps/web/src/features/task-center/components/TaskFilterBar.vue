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
    <!-- Residual #197: assigneeId filter (API TaskQueryDto already supports). -->
    <el-input
      :model-value="modelValue.assigneeId"
      placeholder="执行人 ID"
      clearable
      class="filter-assignee"
      @update:model-value="patch({ assigneeId: String($event ?? '') })"
      @keyup.enter="emit('search')"
      @clear="emit('search')"
    />
    <!-- Residual #201: createdAt window + overdue / hasAttribution (API-ready). -->
    <el-date-picker
      :model-value="modelValue.dateFrom || undefined"
      type="date"
      placeholder="起始日"
      value-format="YYYY-MM-DD"
      clearable
      class="filter-date"
      @update:model-value="patch({ dateFrom: String($event ?? '') })"
    />
    <el-date-picker
      :model-value="modelValue.dateTo || undefined"
      type="date"
      placeholder="截止日"
      value-format="YYYY-MM-DD"
      clearable
      class="filter-date"
      @update:model-value="patch({ dateTo: String($event ?? '') })"
    />
    <el-select
      :model-value="overdueSelect"
      placeholder="逾期筛选"
      clearable
      class="filter-select"
      @update:model-value="onOverdueChange"
    >
      <el-option label="仅逾期排期" value="1" />
    </el-select>
    <el-select
      :model-value="hasAttributionSelect"
      placeholder="归因筛选"
      clearable
      class="filter-select"
      @update:model-value="onHasAttributionChange"
    >
      <el-option label="有归因" value="1" />
    </el-select>
    <!-- Residual #188: surface deep-link scope seeds so operators can clear them. -->
    <el-tag
      v-if="modelValue.campaignId"
      closable
      type="info"
      effect="plain"
      class="filter-scope-tag"
      @close="clearScope('campaignId')"
    >
      活动 {{ shortId(modelValue.campaignId) }}
    </el-tag>
    <el-tag
      v-if="modelValue.groupId"
      closable
      type="info"
      effect="plain"
      class="filter-scope-tag"
      @close="clearScope('groupId')"
    >
      社群 {{ shortId(modelValue.groupId) }}
    </el-tag>
    <!-- Residual #247: packageId deep-link / filter chip. -->
    <el-tag
      v-if="modelValue.packageId"
      closable
      type="info"
      effect="plain"
      class="filter-scope-tag"
      @close="clearScope('packageId')"
    >
      套餐 {{ shortId(modelValue.packageId) }}
    </el-tag>
    <AppleButton variant="primary" @click="emit('search')">
      <template #icon>
        <el-icon><Search /></el-icon>
      </template>
      搜索
    </AppleButton>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Search } from '@element-plus/icons-vue';
import type { TaskStatus, TaskChannel, TaskPriority } from '@content/shared';
import type { TaskFilters } from '../composables/useTaskCenter';
import AppleButton from '../../../components/AppleButton.vue';

const props = defineProps<{
  modelValue: TaskFilters;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: TaskFilters];
  search: [];
}>();

// Residual #201: el-select string values ↔ boolean filter flags.
const overdueSelect = computed(() =>
  props.modelValue.overdue === true ? '1' : props.modelValue.overdue === false ? '0' : ''
);
const hasAttributionSelect = computed(() =>
  props.modelValue.hasAttribution === true
    ? '1'
    : props.modelValue.hasAttribution === false
      ? '0'
      : ''
);

function onOverdueChange(value: string | undefined | null) {
  if (value === '1') patch({ overdue: true });
  else if (value === '0') patch({ overdue: false });
  else patch({ overdue: undefined });
}

function onHasAttributionChange(value: string | undefined | null) {
  if (value === '1') patch({ hasAttribution: true });
  else if (value === '0') patch({ hasAttribution: false });
  else patch({ hasAttribution: undefined });
}

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

/** Residual #188/#247: clear a deep-link scope seed and re-search. */
function clearScope(key: 'campaignId' | 'groupId' | 'packageId') {
  patch({ [key]: '' });
  // Defer search so parent v-model settles before list reload.
  queueMicrotask(() => emit('search'));
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
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

.filter-assignee {
  width: 160px;
}

.filter-date {
  width: 150px;
}

.filter-scope-tag {
  max-width: 180px;
}
</style>
