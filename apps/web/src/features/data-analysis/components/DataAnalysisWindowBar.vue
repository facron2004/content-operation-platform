<script setup lang="ts">
import type { DataAnalysisPreset } from '../composables/useDataAnalysisPage';
import AppleDateRangePicker from './AppleDateRangePicker.vue';

const preset = defineModel<DataAnalysisPreset>('preset', { required: true });

const props = defineProps<{
  presetLabels: Record<DataAnalysisPreset, string>;
  customStart: string;
  customEnd: string;
  windowRange: string;
  loading: boolean;
}>();

const emit = defineEmits<{
  'preset-change': [value: DataAnalysisPreset];
  'range-change': [value: [string, string] | null];
}>();

const PRESETS: DataAnalysisPreset[] = ['today', 'yesterday', 'last7', 'last30', 'custom'];

function pick(p: DataAnalysisPreset) {
  if (p === preset.value && p !== 'custom') return;
  preset.value = p;
  emit('preset-change', p);
}

function onRangeChange(v: [string, string]) {
  // Skip no-op re-emits when the confirmed range matches current custom range.
  if (v[0] === props.customStart && v[1] === props.customEnd && preset.value === 'custom') {
    return;
  }
  emit('range-change', v);
}

/** Block future Beijing-calendar days in the custom range picker. */
function disableFutureDate(date: Date): boolean {
  const today = new Date();
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  return date.getTime() > endOfToday.getTime();
}
</script>

<template>
  <div class="da-filter panel">
    <div class="da-filter__left">
      <div class="da-preset-group" role="tablist" aria-label="时间范围">
        <button
          v-for="p in PRESETS"
          :key="p"
          type="button"
          class="da-preset"
          :class="{ 'is-active': preset === p }"
          :disabled="loading"
          role="tab"
          :aria-selected="preset === p"
          @click="pick(p)"
        >
          {{ presetLabels[p] }}
        </button>
      </div>
      <AppleDateRangePicker
        class="da-range-picker"
        :start="customStart"
        :end="customEnd"
        :disabled="loading"
        :disabled-date="disableFutureDate"
        placeholder="自定义日期范围"
        @change="onRangeChange"
      />
    </div>
    <div class="da-filter__hint">
      <span v-if="windowRange" class="da-filter__range">{{ windowRange }}</span>
      <span v-else-if="!loading" class="da-filter__empty">暂无数据</span>
    </div>
  </div>
</template>
