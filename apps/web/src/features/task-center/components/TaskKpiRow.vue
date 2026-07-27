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
      <!-- Residual #206: status/overdue tiles click-to-filter; GMV stays display-only. -->
      <el-card
        shadow="hover"
        :body-style="{ padding: '16px', textAlign: 'center' }"
        :class="{ 'kpi-card-clickable': kpi.clickable }"
        :role="kpi.clickable ? 'button' : undefined"
        :tabindex="kpi.clickable ? 0 : undefined"
        @click="onActivate(kpi)"
        @keydown.enter="onActivate(kpi)"
        @keydown.space.prevent="onActivate(kpi)"
      >
        <div class="kpi-label">{{ kpi.label }}</div>
        <div class="kpi-value" :class="kpi.color">{{ kpi.value }}</div>
        <div v-if="kpi.clickable" class="kpi-hint">点击筛选</div>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TaskKpiResponse } from '@content/shared';
import { displayMoney, formatCount } from '../../../utils/format';

/** Residual #206: keys that map to list filters (matches getTaskKpi CASE arms). */
export type TaskKpiFilterKey = 'todayPending' | 'inProgress' | 'completed' | 'overdue' | 'failed';

const props = withDefaults(
  defineProps<{
    kpis: TaskKpiResponse | null;
    loading?: boolean;
  }>(),
  { loading: false }
);

const emit = defineEmits<{
  filter: [key: TaskKpiFilterKey];
}>();

const FILTERABLE = new Set<string>([
  'todayPending',
  'inProgress',
  'completed',
  'overdue',
  'failed'
]);

const kpiItems = computed(() => [
  {
    key: 'todayPending' as const,
    label: '今日待处理',
    value: formatCount(props.kpis?.todayPending),
    color: 'warning',
    clickable: true
  },
  {
    key: 'inProgress' as const,
    label: '进行中',
    value: formatCount(props.kpis?.inProgress),
    color: 'primary',
    clickable: true
  },
  {
    key: 'completed' as const,
    label: '已完成',
    value: formatCount(props.kpis?.completed),
    color: 'success',
    clickable: true
  },
  {
    key: 'overdue' as const,
    label: '已逾期',
    value: formatCount(props.kpis?.overdue),
    color: 'danger',
    clickable: true
  },
  {
    key: 'failed' as const,
    label: '已失败',
    value: formatCount(props.kpis?.failed),
    color: 'danger',
    clickable: true
  },
  {
    key: 'todayTaskGmv' as const,
    label: '今日任务 GMV',
    value: displayMoney(props.kpis, 'todayTaskGmv'),
    color: 'success',
    clickable: false
  }
]);

function onActivate(kpi: { key: string; clickable: boolean }) {
  if (!kpi.clickable || !FILTERABLE.has(kpi.key)) return;
  emit('filter', kpi.key as TaskKpiFilterKey);
}
</script>

<style scoped>
.kpi-row {
  margin-bottom: 16px;
}

.kpi-col {
  margin-bottom: 8px;
}

.kpi-card-clickable {
  cursor: pointer;
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.kpi-card-clickable:hover {
  transform: translateY(-1px);
}

.kpi-card-clickable:focus-visible {
  outline: 2px solid var(--el-color-primary, #409eff);
  outline-offset: 2px;
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

.kpi-hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--el-text-color-placeholder, #c0c4cc);
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
