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

type Ymd = string;
type RangeTuple = [Ymd, Ymd];

type DayCell = {
  day: number;
  date: Date;
  ymd: Ymd;
  isCurrentMonth: boolean;
  isToday: boolean;
  disabled: boolean;
};

const props = withDefaults(
  defineProps<{
    start?: Ymd;
    end?: Ymd;
    placeholder?: string;
    disabled?: boolean;
    disabledDate?: (date: Date) => boolean;
  }>(),
  {
    placeholder: '开始日期  →  结束日期',
    disabled: false
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

function toYmd(d: Date): Ymd {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(ymd: string): Date | null {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatCn(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function isToday(date: Date) {
  const t = new Date();
  return (
    date.getFullYear() === t.getFullYear() &&
    date.getMonth() === t.getMonth() &&
    date.getDate() === t.getDate()
  );
}

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
  const year = currentYear.value;
  const month = currentMonth.value;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const days: Array<DayCell | null> = [];

  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(makeCell(d, false));
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(makeCell(new Date(year, month, i), true));
  }
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push(makeCell(new Date(year, month + 1, i), false));
  }
  return days;
});

function makeCell(d: Date, isCurrentMonth: boolean): DayCell {
  return {
    day: d.getDate(),
    date: d,
    ymd: toYmd(d),
    isCurrentMonth,
    isToday: isToday(d),
    disabled: props.disabledDate ? props.disabledDate(d) : false
  };
}

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
  const range: RangeTuple = a <= b ? [a, b] : [b, a];
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

<style scoped>
.apple-range-picker {
  display: inline-block;
  position: relative;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif;
}

.apple-range-picker.is-disabled {
  opacity: 0.55;
  pointer-events: none;
}

.apple-range-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 240px;
  max-width: 100%;
  padding: 7px 12px 7px 12px;
  border: 1px solid rgba(60, 60, 67, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  color: #1d1d1f;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.12s ease;
  outline: none;
  user-select: none;
  -webkit-user-select: none;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}

.apple-range-trigger:hover {
  border-color: rgba(60, 60, 67, 0.22);
  background: #fff;
}

.apple-range-trigger:focus-visible {
  border-color: rgba(0, 122, 255, 0.55);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.18);
}

.apple-range-trigger:active {
  transform: scale(0.985);
  background: #f5f5f7;
}

.apple-range-icon {
  flex-shrink: 0;
  color: #86868b;
}

.apple-range-value {
  flex: 1;
  min-width: 0;
  text-align: left;
  color: #1d1d1f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.apple-range-value.is-placeholder {
  color: #86868b;
  font-weight: 400;
}

.apple-range-chevron {
  flex-shrink: 0;
  color: #aeaeb2;
}

.apple-range-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: transparent;
}

.apple-range-panel {
  z-index: 1000;
  width: 300px;
  padding: 14px 14px 12px;
  background: rgba(255, 255, 255, 0.86);
  border: 0.5px solid rgba(60, 60, 67, 0.1);
  border-radius: 18px;
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.04),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
  animation: apple-range-in 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
  transform-origin: top center;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif;
}

@keyframes apple-range-in {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.apple-range-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 0 2px;
}

.apple-range-title {
  font-size: 15px;
  font-weight: 600;
  color: #1d1d1f;
  letter-spacing: -0.01em;
}

.apple-range-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: none;
  background: rgba(120, 120, 128, 0.1);
  color: #1d1d1f;
  cursor: pointer;
  transition:
    background 0.15s ease,
    transform 0.12s ease;
  outline: none;
}

.apple-range-nav:hover {
  background: rgba(120, 120, 128, 0.16);
}

.apple-range-nav:active {
  transform: scale(0.92);
}

.apple-range-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
  text-align: center;
}

.apple-range-weekdays span {
  font-size: 11px;
  font-weight: 600;
  color: #86868b;
  line-height: 28px;
  letter-spacing: 0.02em;
}

.apple-range-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px 0;
}

.apple-range-cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.apple-range-cell.is-empty {
  cursor: default;
  pointer-events: none;
}

.apple-range-day-num {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 400;
  color: #1d1d1f;
  line-height: 1;
  transition:
    background 0.12s ease,
    color 0.12s ease,
    transform 0.1s ease;
}

.apple-range-cell:hover:not(.is-disabled):not(.is-empty) .apple-range-day-num {
  background: rgba(0, 122, 255, 0.1);
}

.apple-range-cell:active:not(.is-disabled):not(.is-empty) .apple-range-day-num {
  transform: scale(0.92);
}

/* continuous range bar */
.apple-range-cell.is-in-range::before {
  content: '';
  position: absolute;
  inset: 4px 0;
  background: rgba(0, 122, 255, 0.1);
}

.apple-range-cell.is-range-start.is-in-range::before {
  left: 50%;
  right: 0;
  border-radius: 0;
}

.apple-range-cell.is-range-end.is-in-range::before {
  left: 0;
  right: 50%;
  border-radius: 0;
}

.apple-range-cell.is-range-start.is-range-end.is-in-range::before {
  display: none;
}

.apple-range-cell.is-selected .apple-range-day-num,
.apple-range-cell.is-pending-start .apple-range-day-num,
.apple-range-cell.is-range-start .apple-range-day-num,
.apple-range-cell.is-range-end .apple-range-day-num {
  background: #007aff;
  color: #fff;
  font-weight: 600;
}

.apple-range-cell.is-today:not(.is-selected):not(.is-pending-start):not(.is-range-start):not(
    .is-range-end
  )
  .apple-range-day-num {
  color: #007aff;
  font-weight: 600;
}

.apple-range-cell.is-today:not(.is-selected):not(.is-pending-start):not(.is-range-start):not(
    .is-range-end
  )
  .apple-range-day-num::after {
  content: '';
  position: absolute;
  bottom: 3px;
  width: 3px;
  height: 3px;
  border-radius: 999px;
  background: #007aff;
}

.apple-range-cell.is-outside .apple-range-day-num {
  color: #c7c7cc;
}

.apple-range-cell.is-disabled {
  cursor: not-allowed;
}

.apple-range-cell.is-disabled .apple-range-day-num {
  opacity: 0.32;
}

.apple-range-cell.is-disabled:hover .apple-range-day-num {
  background: transparent;
}

.apple-range-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 0.5px solid rgba(60, 60, 67, 0.1);
}

.apple-range-hint {
  min-width: 0;
  flex: 1;
  color: #86868b;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.apple-range-footer-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.apple-range-ghost,
.apple-range-primary {
  appearance: none;
  border: 0;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    opacity 0.15s ease,
    transform 0.1s ease;
  outline: none;
}

.apple-range-ghost {
  background: rgba(120, 120, 128, 0.12);
  color: #1d1d1f;
}

.apple-range-ghost:hover {
  background: rgba(120, 120, 128, 0.18);
}

.apple-range-primary {
  background: #007aff;
  color: #fff;
}

.apple-range-primary:hover:not(:disabled) {
  background: #0071eb;
}

.apple-range-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.apple-range-ghost:active,
.apple-range-primary:active:not(:disabled) {
  transform: scale(0.96);
}
</style>
