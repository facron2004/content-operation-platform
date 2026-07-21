<template>
  <el-row v-loading="loading" :gutter="16" class="kpi-row">
    <el-col
      v-for="kpi in kpiItems"
      :key="kpi.key"
      :xs="12"
      :sm="8"
      :md="4"
      :lg="4"
      :xl="4"
      class="kpi-col"
    >
      <el-card shadow="hover" :body-style="{ padding: '16px', textAlign: 'center' }">
        <div class="kpi-label">{{ kpi.label }}</div>
        <div class="kpi-value" :class="kpi.color">{{ kpi.value }}</div>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TaskKpiResponse } from '@content/shared';
import { formatCount, formatGmv } from '../../../utils/format';

const props = withDefaults(
  defineProps<{
    kpis: TaskKpiResponse | null;
    loading?: boolean;
  }>(),
  { loading: false }
);

const kpiItems = computed(() => [
  {
    key: 'todayPending',
    label: '今日待处理',
    value: formatCount(props.kpis?.todayPending),
    color: 'warning'
  },
  {
    key: 'inProgress',
    label: '进行中',
    value: formatCount(props.kpis?.inProgress),
    color: 'primary'
  },
  {
    key: 'completed',
    label: '已完成',
    value: formatCount(props.kpis?.completed),
    color: 'success'
  },
  {
    key: 'overdue',
    label: '已逾期',
    value: formatCount(props.kpis?.overdue),
    color: 'danger'
  },
  {
    key: 'failed',
    label: '已失败',
    value: formatCount(props.kpis?.failed),
    color: 'danger'
  },
  {
    key: 'todayTaskGmv',
    label: '今日任务 GMV',
    value: formatGmv(props.kpis?.todayTaskGmv),
    color: 'success'
  }
]);
</script>

<style scoped>
.kpi-row {
  margin-bottom: 16px;
}

.kpi-col {
  margin-bottom: 8px;
}

.kpi-label {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  margin-bottom: 8px;
}

.kpi-value {
  font-size: 22px;
  font-weight: 700;
}

.kpi-value.warning {
  color: var(--el-color-warning, #e6a23c);
}

.kpi-value.primary {
  color: var(--el-color-primary, #409eff);
}

.kpi-value.success {
  color: var(--el-color-success, #67c23a);
}

.kpi-value.danger {
  color: var(--el-color-danger, #f56c6c);
}
</style>
