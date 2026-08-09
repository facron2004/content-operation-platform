<template>
  <el-card v-if="canViewPlatformKpis" v-loading="loading" class="task-kpi-card">
    <template #header><span>今日任务</span></template>
    <ErrorAlert :message="loadError" />
    <el-row :gutter="16">
      <!-- Residual #206: clickable tiles drill into task center with matching status. -->
      <el-col :span="4">
        <MetricTile
          label="待执行"
          :value="kpis.todayPending"
          info
          clickable
          hint="点击查看已排期任务"
          @activate="goTasks({ status: 'scheduled' })"
        />
      </el-col>
      <el-col :span="4">
        <MetricTile
          label="进行中"
          :value="kpis.inProgress"
          clickable
          hint="点击查看已发布任务"
          @activate="goTasks({ status: 'published' })"
        />
      </el-col>
      <el-col :span="4">
        <MetricTile
          label="已完成"
          :value="kpis.completed"
          clickable
          @activate="goTasks({ status: 'completed' })"
        />
      </el-col>
      <el-col :span="4">
        <MetricTile
          label="已逾期"
          :value="kpis.overdue"
          danger
          clickable
          hint="点击查看逾期任务"
          @activate="goTasks({ status: 'overdue' })"
        />
      </el-col>
      <el-col :span="4">
        <MetricTile
          label="失败"
          :value="kpis.failed"
          danger
          clickable
          @activate="goTasks({ status: 'failed' })"
        />
      </el-col>
      <el-col :span="4">
        <MetricTile label="任务 GMV" :value="formatFenYuan(kpis.todayTaskGmv)" />
      </el-col>
    </el-row>
  </el-card>
  <el-card v-else class="task-kpi-card task-kpi-restricted">
    <template #header><span>今日任务</span></template>
    <p>当前账号仅显示授权范围内的数据，平台任务汇总需要平台分析权限。</p>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useRoleStore } from '../../../stores/role';
import { formatFenYuan } from '../../../utils/format';
import MetricTile from '../../../components/MetricTile.vue';
import ErrorAlert from '../../../components/ErrorAlert.vue';
import { useDashboardTaskMetrics } from '../composables/useDashboardTaskMetrics';

const router = useRouter();
const roleStore = useRoleStore();
const canViewPlatformKpis = computed(() =>
  roleStore.effectiveRoles.some((role) => ['admin', 'platform_operator', 'auditor'].includes(role))
);
const { loading, loadError, kpis } = useDashboardTaskMetrics(canViewPlatformKpis);

/** Residual #206: dashboard KPI → task center deep-link (status matches getTaskKpi). */
function goTasks(query: Record<string, string>) {
  router.push({ name: 'tasks', query });
}
</script>

<style scoped>
.task-kpi-card {
  margin-bottom: 16px;
}

.task-kpi-restricted p {
  margin: 0;
  color: var(--text-secondary, #64748b);
}
</style>
