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
defineProps<{ tasks: CommunityTask[] }>();
defineEmits<{ navigate: [path: string]; 'generate-card': [packageId: string] }>();
</script>
<style src="../../../styles/components/community-task-panel.css" scoped></style>
