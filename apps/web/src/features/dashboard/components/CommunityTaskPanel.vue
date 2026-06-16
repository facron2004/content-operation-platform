<template>
  <section class="panel">
    <div class="panel-head">
      <h2>今日社群推送任务</h2>
      <el-button text type="primary" @click="$emit('navigate', '/communities')">社群运营</el-button>
    </div>
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
  border-radius: 8px;
  background: #fff;
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
  color: var(--ink);
  line-height: 1.5;
}
</style>
