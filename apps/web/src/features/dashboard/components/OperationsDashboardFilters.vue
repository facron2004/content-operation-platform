<template>
  <header class="dashboard-header">
    <div class="dashboard-header__copy">
      <div class="dashboard-eyebrow">
        <span class="dashboard-eyebrow__dot" />
        OPERATIONS / LIVE
      </div>
      <h1>{{ title }}</h1>
      <p>用一页看清经营结果、异常信号和下一步动作。</p>
    </div>

    <div class="dashboard-header__controls">
      <div class="dashboard-source">
        <span class="dashboard-source__dot" />
        <span>{{ sourceLabel }}</span>
      </div>
      <label class="dashboard-filter">
        <span>时间</span>
        <el-select
          :model-value="filters.timeRange"
          size="small"
          aria-label="时间范围"
          @update:model-value="update('timeRange', $event)"
        >
          <el-option
            v-for="item in timeOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </label>
      <AppleButton variant="secondary" size="sm" :loading="loading" @click="$emit('refresh')">
        <template #icon><Refresh /></template>
        刷新
      </AppleButton>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import AppleButton from '../../../components/AppleButton.vue';
import {
  TIME_RANGE_OPTIONS,
  type DashboardFilters
} from '../operations-dashboard';

const props = defineProps<{
  title: string;
  filters: DashboardFilters;
  sourceLabel: string;
  loading: boolean;
}>();

const emit = defineEmits<{
  change: [next: Partial<DashboardFilters>];
  refresh: [];
}>();

const timeOptions = TIME_RANGE_OPTIONS;

function update(key: keyof DashboardFilters, value: string) {
  emit('change', { [key]: value } as Partial<DashboardFilters>);
}
</script>

<style scoped>
.dashboard-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 8px 2px 4px;
}

.dashboard-header__copy {
  min-width: 0;
}

.dashboard-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #8290a3;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.dashboard-eyebrow__dot,
.dashboard-source__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
}

.dashboard-header h1 {
  margin: 9px 0 0;
  color: #162235;
  font-size: clamp(24px, 2.3vw, 34px);
  font-weight: 800;
  letter-spacing: -0.045em;
  line-height: 1;
}

.dashboard-header p {
  margin: 9px 0 0;
  color: #7b8798;
  font-size: 13px;
}

.dashboard-header__controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  flex-wrap: wrap;
}

.dashboard-source {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid #dbe4f0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #6f7f93;
  font-size: 11px;
  font-weight: 700;
}

.dashboard-source__dot {
  width: 6px;
  height: 6px;
  background: #14b8a6;
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12);
}

.dashboard-filter {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  padding: 0 7px 0 10px;
  border: 1px solid #dce4ed;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.86);
  color: #637286;
  font-size: 11px;
  white-space: nowrap;
}

.dashboard-filter :deep(.el-select) {
  width: 102px;
}

.dashboard-filter :deep(.el-select__wrapper) {
  min-height: 28px;
  padding: 0 6px;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.dashboard-filter :deep(.el-select__selected-item) {
  color: #26364b;
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 1100px) {
  .dashboard-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .dashboard-header__controls {
    justify-content: flex-start;
  }
}

@media (max-width: 680px) {
  .dashboard-header__controls,
  .dashboard-source,
  .dashboard-filter {
    width: 100%;
  }

  .dashboard-filter {
    justify-content: space-between;
  }

  .dashboard-filter :deep(.el-select) {
    flex: 1;
    width: auto;
  }
}
</style>
