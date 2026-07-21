<template>
  <div class="proto-filter-bar panel">
    <AppleDatePicker
      :model-value="kpiDate"
      :placeholder="'选择日期'"
      :disabled-date="disableFutureDate"
      class="proto-filter-date"
      @update:model-value="onDateChange"
      @change="$emit('date-change')"
    />
    <el-select model-value="all" class="proto-filter-item" disabled>
      <el-option label="城市：全部城市" value="all" />
    </el-select>
    <el-select model-value="all" class="proto-filter-item" disabled>
      <el-option label="商圈：全部商圈" value="all" />
    </el-select>
    <el-select model-value="all" class="proto-filter-item" disabled>
      <el-option label="商家类型：全部" value="all" />
    </el-select>
    <el-select model-value="all" class="proto-filter-item" disabled>
      <el-option label="品类：全部" value="all" />
    </el-select>
    <el-button class="proto-filter-reset" @click="onReset">
      <el-icon><RefreshRight /></el-icon>
      重置
    </el-button>
    <div class="proto-filter-actions">
      <el-tag size="small" effect="plain" type="info">{{ dataSource || '加载中' }}</el-tag>
      <span class="updated-at">更新 {{ formatTime(updatedAt) }}</span>
      <GmvCockpitBackfill
        :backfilling="backfilling"
        :backfill-label="backfillLabel"
        @backfill="$emit('backfill', $event)"
      />
      <el-button size="small" :loading="loading" data-testid="gmv-reload" @click="$emit('reload')">
        刷新
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RefreshRight } from '@element-plus/icons-vue';
import { formatTime } from '../../../utils/labels';
import GmvCockpitBackfill from './GmvCockpitBackfill.vue';
import AppleDatePicker from './AppleDatePicker.vue';

const props = defineProps<{
  kpiDate: string;
  todayText: string;
  dataSource?: string;
  updatedAt?: string;
  backfilling: boolean;
  backfillLabel: string;
  loading: boolean;
  disableFutureDate: (date: Date) => boolean;
}>();

const emit = defineEmits<{
  'update:kpiDate': [value: string];
  'date-change': [];
  backfill: [days: number];
  reload: [];
}>();

function onDateChange(val: string | null) {
  emit('update:kpiDate', val || props.todayText);
}

function onReset() {
  emit('update:kpiDate', props.todayText);
  emit('date-change');
}
</script>

<style src="../../../styles/components/gmv-proto-filter.css" scoped></style>
