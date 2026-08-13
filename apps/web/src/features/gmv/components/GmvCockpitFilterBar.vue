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
    <AppleButton variant="secondary" size="sm" class="proto-filter-reset" @click="onReset">
      回到今天
    </AppleButton>

    <div class="proto-filter-meta">
      <span class="apple-meta-pill">{{ dataSource || '加载中' }}</span>
      <span class="updated-at">更新 {{ formatTime(updatedAt) }}</span>
      <GmvCockpitBackfill
        v-if="canRefresh"
        :backfilling="backfilling"
        :backfill-label="backfillLabel"
        :today-text="todayText"
        :disable-future-date="disableFutureDate"
        @backfill="$emit('backfill', $event)"
        @backfill-date="$emit('backfill-date', $event)"
      />
      <AppleButton
        variant="secondary"
        size="sm"
        :loading="loading"
        data-testid="gmv-load"
        @click="$emit('load')"
      >
        重新加载本地数据
      </AppleButton>
      <AppleButton
        v-if="canRefresh"
        variant="primary"
        size="sm"
        :loading="loading"
        data-testid="gmv-sync"
        @click="$emit('reload')"
      >
        同步所选日订单
      </AppleButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
import { formatTime } from '../../../utils/labels';
import GmvCockpitBackfill from './GmvCockpitBackfill.vue';
import AppleDatePicker from './AppleDatePicker.vue';
import type { GmvBackfillRange } from '../composables/gmv-cockpit-core';

const props = defineProps<{
  kpiDate: string;
  todayText: string;
  dataSource?: string;
  updatedAt?: string | null;
  backfilling: boolean;
  backfillLabel: string;
  loading: boolean;
  canRefresh: boolean;
  disableFutureDate: (date: Date) => boolean;
}>();

const emit = defineEmits<{
  'update:kpiDate': [value: string];
  'date-change': [];
  backfill: [days: number];
  'backfill-date': [range: GmvBackfillRange];
  load: [];
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

.proto-filter-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
  width: auto;
  flex-wrap: wrap;
  margin-left: auto;
}

.updated-at {
  color: var(--muted);
  font-size: 12px;
}
</style>
