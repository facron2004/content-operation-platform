<template>
  <div class="hero-meta">
    <div class="hero-controls">
      <span class="control-label">KPI 日期</span>
      <AppleDatePicker
        :model-value="kpiDate"
        :placeholder="'选择日期'"
        :disabled-date="disableFutureDate"
        @update:model-value="$emit('update:kpiDate', $event)"
        @change="$emit('date-change')"
      />
    </div>
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
</template>
<script setup lang="ts">
import { formatTime } from '../../../utils/labels';
import GmvCockpitBackfill from './GmvCockpitBackfill.vue';
import AppleDatePicker from './AppleDatePicker.vue';
defineProps<{
  kpiDate: string;
  dataSource?: string;
  updatedAt?: string;
  backfilling: boolean;
  backfillLabel: string;
  loading: boolean;
  disableFutureDate: (date: Date) => boolean;
}>();
defineEmits<{
  'update:kpiDate': [value: string];
  'date-change': [];
  backfill: [days: number];
  reload: [];
}>();
</script>
