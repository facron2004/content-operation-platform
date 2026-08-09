<template>
  <div ref="wrapperRef" class="apple-range-picker" :class="{ 'is-disabled': disabled }">
    <button
      class="apple-range-trigger"
      type="button"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="toggleOpen"
    >
      <svg
        class="apple-range-icon"
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      <span class="apple-range-value" :class="{ 'is-placeholder': !displayText }">
        {{ displayText || placeholder }}
      </span>
      <svg
        class="apple-range-chevron"
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <Teleport to="body">
      <div v-if="open" class="apple-range-overlay" @click="close" />
      <div
        v-if="open"
        ref="panelRef"
        class="apple-range-panel"
        role="dialog"
        aria-label="选择日期范围"
        :style="panelStyle"
      >
        <div class="apple-range-header">
          <button class="apple-range-nav" type="button" aria-label="上一月" @click="prevMonth">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span class="apple-range-title">{{ currentYear }}年{{ currentMonth + 1 }}月</span>
          <button class="apple-range-nav" type="button" aria-label="下一月" @click="nextMonth">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        <div class="apple-range-weekdays" aria-hidden="true">
          <span v-for="d in weekdays" :key="d">{{ d }}</span>
        </div>

        <div class="apple-range-grid">
          <button
            v-for="(day, i) in calendarDays"
            :key="i"
            type="button"
            class="apple-range-cell"
            :class="cellClass(day)"
            :disabled="!day || day.disabled"
            :tabindex="day && day.isCurrentMonth && !day.disabled ? 0 : -1"
            @click="day && selectDay(day)"
            @mouseenter="day && onHover(day)"
          >
            <span v-if="day" class="apple-range-day-num">{{ day.day }}</span>
          </button>
        </div>

        <div class="apple-range-footer">
          <span class="apple-range-hint">{{ selectionHint }}</span>
          <div class="apple-range-footer-actions">
            <button type="button" class="apple-range-ghost" @click="close">取消</button>
            <button
              type="button"
              class="apple-range-primary"
              :disabled="!draftStart || !draftEnd"
              @click="confirm"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  buildDateRangeCalendarDays,
  formatDateRangeCn as formatCn,
  normalizeDateRange,
  parseDateRangeYmd as parseYmd,
  type DateRangeDayCell as DayCell,
  type DateRangeTuple as RangeTuple,
  type DateRangeYmd as Ymd
} from '../utils/date-range-picker-core';

const props = withDefaults(
  defineProps<{
    start?: Ymd;
    end?: Ymd;
    placeholder?: string;
    disabled?: boolean;
    disabledDate?: (date: Date) => boolean;
  }>(),
  {
    start: undefined,
    end: undefined,
    placeholder: '开始日期  →  结束日期',
    disabled: false,
    disabledDate: () => false
  }
);

const emit = defineEmits<{
  change: [value: RangeTuple];
}>();

const wrapperRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const open = ref(false);
const currentYear = ref(new Date().getFullYear());
const currentMonth = ref(new Date().getMonth());
const panelStyle = ref<Record<string, string>>({});
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

const draftStart = ref<Ymd | null>(null);
const draftEnd = ref<Ymd | null>(null);
const hoverYmd = ref<Ymd | null>(null);

const displayText = computed(() => {
  if (props.start && props.end) {
    if (props.start === props.end) return formatCn(props.start);
    return `${formatCn(props.start)}  –  ${formatCn(props.end)}`;
  }
  return '';
});

const selectionHint = computed(() => {
  if (!draftStart.value) return '选择开始日期';
  if (!draftEnd.value) return `开始 ${formatCn(draftStart.value)} · 再选结束日期`;
  if (draftStart.value === draftEnd.value) return formatCn(draftStart.value);
  return `${formatCn(draftStart.value)}  –  ${formatCn(draftEnd.value)}`;
});

const previewEnd = computed(() => {
  if (draftStart.value && !draftEnd.value && hoverYmd.value) return hoverYmd.value;
  return draftEnd.value;
});

const rangeBounds = computed(() => {
  const a = draftStart.value;
  const b = previewEnd.value;
  if (!a || !b) return null;
  return a <= b ? ([a, b] as const) : ([b, a] as const);
});

const calendarDays = computed(() => {
  return buildDateRangeCalendarDays(currentYear.value, currentMonth.value, props.disabledDate);
});

function cellClass(day: DayCell | null) {
  if (!day) return { 'is-empty': true };
  const bounds = rangeBounds.value;
  const isStart =
    draftStart.value === day.ymd || (bounds && bounds[0] === day.ymd && draftEnd.value);
  const isEnd = draftEnd.value === day.ymd || (bounds && bounds[1] === day.ymd && draftStart.value);
  const inRange = bounds != null && day.ymd > bounds[0] && day.ymd < bounds[1];
  const isEdge = bounds != null && (day.ymd === bounds[0] || day.ymd === bounds[1]);
  return {
    'is-outside': !day.isCurrentMonth,
    'is-today': day.isToday,
    'is-disabled': day.disabled,
    'is-in-range': inRange || (isEdge && bounds && bounds[0] !== bounds[1]),
    'is-range-start': isEdge && bounds && day.ymd === bounds[0],
    'is-range-end': isEdge && bounds && day.ymd === bounds[1],
    'is-selected': Boolean(isStart || isEnd || (isEdge && bounds && bounds[0] === bounds[1])),
    'is-pending-start': draftStart.value === day.ymd && !draftEnd.value
  };
}

function prevMonth() {
  if (currentMonth.value === 0) {
    currentYear.value--;
    currentMonth.value = 11;
  } else {
    currentMonth.value--;
  }
}

function nextMonth() {
  if (currentMonth.value === 11) {
    currentYear.value++;
    currentMonth.value = 0;
  } else {
    currentMonth.value++;
  }
}

function selectDay(day: DayCell) {
  if (day.disabled) return;
  if (!draftStart.value || (draftStart.value && draftEnd.value)) {
    draftStart.value = day.ymd;
    draftEnd.value = null;
    hoverYmd.value = null;
    return;
  }
  // Second click completes the range and applies immediately
  // (matches previous el-date-picker daterange behaviour).
  if (day.ymd < draftStart.value) {
    draftEnd.value = draftStart.value;
    draftStart.value = day.ymd;
  } else {
    draftEnd.value = day.ymd;
  }
  hoverYmd.value = null;
  confirm();
}

function onHover(day: DayCell) {
  if (day.disabled) return;
  if (draftStart.value && !draftEnd.value) hoverYmd.value = day.ymd;
}

function confirm() {
  if (!draftStart.value || !draftEnd.value) return;
  const a = draftStart.value;
  const b = draftEnd.value;
  const range: RangeTuple = normalizeDateRange(a, b);
  emit('change', range);
  close();
}

function toggleOpen() {
  if (props.disabled) return;
  if (open.value) close();
  else openCalendar();
}

function openCalendar() {
  draftStart.value = props.start || null;
  draftEnd.value = props.end || null;
  hoverYmd.value = null;
  const anchor = parseYmd(props.start || props.end || '') || new Date();
  currentYear.value = anchor.getFullYear();
  currentMonth.value = anchor.getMonth();
  open.value = true;
  nextTick(() => positionPanel());
}

function close() {
  open.value = false;
  hoverYmd.value = null;
}

function positionPanel() {
  if (!wrapperRef.value || !panelRef.value) return;
  const trigger = wrapperRef.value.getBoundingClientRect();
  const panelH = panelRef.value.offsetHeight || 380;
  const panelW = panelRef.value.offsetWidth || 300;
  const spaceBelow = window.innerHeight - trigger.bottom;
  const spaceAbove = trigger.top;
  const top =
    spaceBelow >= panelH + 8 || spaceBelow > spaceAbove
      ? trigger.bottom + 6
      : Math.max(8, trigger.top - panelH - 6);
  const left = Math.min(Math.max(8, trigger.left), window.innerWidth - panelW - 8);
  panelStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`
  };
}

function handleClickOutside(e: MouseEvent) {
  if (!open.value) return;
  const target = e.target as Node;
  if (wrapperRef.value?.contains(target)) return;
  if (panelRef.value?.contains(target)) return;
  close();
}

function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) close();
}

function handleResize() {
  if (open.value) positionPanel();
}

watch(open, (val) => {
  if (val) {
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
  } else {
    document.removeEventListener('mousedown', handleClickOutside, true);
    document.removeEventListener('keydown', handleEscape);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('scroll', handleResize, true);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside, true);
  document.removeEventListener('keydown', handleEscape);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('scroll', handleResize, true);
});
</script>

<style scoped src="../../../styles/components/apple-date-range-picker.css"></style>
