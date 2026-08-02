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
    <span class="apple-filter-chip is-disabled">城市：全部城市</span>
    <span class="apple-filter-chip is-disabled">商圈：全部商圈</span>
    <span class="apple-filter-chip is-disabled">商家类型：全部</span>
    <span class="apple-filter-chip is-disabled">品类：全部品类</span>

    <div class="proto-filter-actions">
      <AppleButton variant="secondary" size="sm" class="proto-filter-reset" @click="onReset">
        重置
      </AppleButton>
      <AppleButton variant="secondary" size="sm" class="proto-filter-export" @click="onExport">
        导出
      </AppleButton>
      <AppleButton variant="primary" size="sm" class="proto-filter-search" @click="onSearch">
        <template #icon>
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </template>
        筛选
      </AppleButton>
    </div>

    <div class="proto-filter-meta">
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
  </div>
</template>

<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
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
  export: [];
  search: [];
}>();

function onDateChange(val: string | null) {
  emit('update:kpiDate', val || props.todayText);
}

function onReset() {
  emit('update:kpiDate', props.todayText);
  emit('date-change');
}

function onExport() {
  emit('export');
}

function onSearch() {
  emit('search');
}
</script>

<style src="../../../styles/components/gmv-proto-filter.css" scoped></style>

<style scoped>
.apple-filter-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(120, 120, 128, 0.1);
  color: #86868b;
  font-size: 12px;
  font-weight: 560;
  letter-spacing: -0.01em;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
  white-space: nowrap;
}

.apple-filter-chip.is-disabled {
  opacity: 0.75;
  cursor: not-allowed;
}

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

.proto-filter-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-left: auto;
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
}

.updated-at {
  color: var(--muted);
  font-size: 12px;
}
</style>
