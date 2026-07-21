<template>
  <el-card v-loading="loading" class="task-kpi-card">
    <template #header><span>今日任务</span></template>
    <el-row :gutter="16">
      <el-col :span="4"><MetricTile label="待执行" :value="kpis.todayPending" info /></el-col>
      <el-col :span="4"><MetricTile label="进行中" :value="kpis.inProgress" /></el-col>
      <el-col :span="4"><MetricTile label="已完成" :value="kpis.completed" /></el-col>
      <el-col :span="4"><MetricTile label="已逾期" :value="kpis.overdue" danger /></el-col>
      <el-col :span="4"><MetricTile label="失败" :value="kpis.failed" danger /></el-col>
      <el-col :span="4">
        <MetricTile label="任务 GMV" :value="'¥' + (kpis.todayTaskGmv / 100).toFixed(2)" />
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../../../services/api';
import MetricTile from '../../../components/MetricTile.vue';

const loading = ref(false);
const kpis = ref({
  todayPending: 0,
  inProgress: 0,
  completed: 0,
  overdue: 0,
  failed: 0,
  todayTaskGmv: 0
});

async function loadKPIs() {
  loading.value = true;
  try {
    const data = await api.getTaskKPIs();
    kpis.value = data;
  } catch {
    /* ignore */
  } finally {
    loading.value = false;
  }
}

onMounted(loadKPIs);
</script>

<style scoped>
.task-kpi-card {
  margin-bottom: 16px;
}
</style>
