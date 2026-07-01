<template>
  <section class="panel dashboard-subpanel">
    <SectionHeader
      title="今日社群推送任务"
      description="按群组和渠道查看待执行任务，必要时直接生成对应作战卡。"
    >
      <template #actions>
        <el-button text type="primary" @click="$emit('navigate', '/communities')">
          社群运营
        </el-button>
      </template>
    </SectionHeader>
    <div v-if="tasks.length" class="task-list">
      <article v-for="task in tasks" :key="task.taskId" class="task-row">
        <div>
          <strong>{{ task.groupName }}</strong>
          <span>{{ task.plannedTime }} / {{ channelLabels[task.channel] }}</span>
          <p>{{ task.reason }}</p>
        </div>
        <el-button size="small" @click="$emit('generate-card', task.packageId)">作战卡</el-button>
      </article>
    </div>
    <EmptyState
      v-else
      icon="群"
      title="暂无社群任务"
      description="待有匹配套餐后生成社群推送任务"
    />
  </section>
</template>

<script setup lang="ts">
import SectionHeader from '../../../components/SectionHeader.vue';
import EmptyState from '../../../components/EmptyState.vue';
import { channelLabels } from '../../../utils/labels';
import type { CommunityTask } from '../composables/useDashboard';

defineProps<{
  tasks: CommunityTask[];
}>();

defineEmits<{
  navigate: [path: string];
  'generate-card': [packageId: string];
}>();
</script>

<style scoped>
.panel-head h2 {
  margin: 0;
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
}

.panel-head p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}

.task-row strong {
  display: block;
  margin-bottom: 6px;
  color: var(--ink);
}

.task-row span {
  color: var(--muted);
  font-size: 13px;
}

.task-row p {
  margin: 8px 0 0;
  color: var(--ink-soft);
  line-height: 1.5;
}
</style>
