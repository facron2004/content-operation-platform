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
    <span class="apple-meta-pill">{{ dataSource || '加载中' }}</span>
    <span class="updated-at">更新 {{ formatTime(updatedAt) }}</span>
    <GmvCockpitBackfill
      :backfilling="backfilling"
      :backfill-label="backfillLabel"
      :today-text="todayText"
      @backfill="$emit('backfill', $event)"
    />
    <AppleButton
      variant="secondary"
      size="sm"
      :loading="loading"
      data-testid="gmv-reload"
      @click="$emit('reload')"
    >
      刷新
    </AppleButton>
  </div>
</template>
<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
import { formatTime } from '../../../utils/labels';
import GmvCockpitBackfill from './GmvCockpitBackfill.vue';
import AppleDatePicker from './AppleDatePicker.vue';
defineProps<{
  kpiDate: string;
  todayText: string;
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

<style scoped>
.apple-meta-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(120, 120, 128, 0.12);
  color: #3a3a3c;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -0.01em;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
}
</style>
