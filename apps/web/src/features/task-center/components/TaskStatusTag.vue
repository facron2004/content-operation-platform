<template>
  <el-tag :type="tagType" :size="size" effect="dark" class="task-status-tag">
    {{ label }}
  </el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TaskStatus } from '@content/shared';

type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger';

const props = withDefaults(
  defineProps<{
    status: string;
    size?: 'default' | 'small' | 'large';
  }>(),
  { size: 'default' }
);

const STATUS_MAP: Record<TaskStatus, { type?: TagType; label: string }> = {
  draft: { type: 'info', label: '草稿' },
  waiting_audit: { type: 'warning', label: '待审核' },
  scheduled: { type: 'primary', label: '已排期' },
  published: { type: 'success', label: '已发布' },
  completed: { type: undefined, label: '已完成' },
  overdue: { type: 'danger', label: '已逾期' },
  failed: { type: 'danger', label: '已失败' },
  cancelled: { type: 'info', label: '已取消' },
  blocked: { type: 'danger', label: '已阻塞' }
};

const tagType = computed<TagType | undefined>(() => STATUS_MAP[props.status as TaskStatus]?.type);
const label = computed(() => STATUS_MAP[props.status as TaskStatus]?.label || props.status);
</script>

<style scoped>
.task-status-tag {
  font-weight: 500;
  min-width: 56px;
  text-align: center;
}
</style>
