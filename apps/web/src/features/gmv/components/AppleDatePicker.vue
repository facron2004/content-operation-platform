<template>
  <div ref="wrapperRef" class="apple-date-picker">
    <!-- Trigger -->
    <button class="apple-date-trigger" type="button" @click="toggleOpen">
      <svg
        class="apple-date-icon"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      <span class="apple-date-value" :class="{ 'apple-date-placeholder': !displayText }">
        {{ displayText || placeholder }}
      </span>
    </button>

    <!-- Calendar dropdown -->
    <Teleport to="body">
      <div v-if="open" class="apple-date-overlay" @click="close" />
      <div v-if="open" ref="panelRef" class="apple-date-panel" :style="panelStyle">
        <!-- Header: month navigation -->
        <div class="apple-date-header">
          <button class="apple-date-nav" type="button" :disabled="!canGoPrev" @click="prevMonth">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span class="apple-date-title">{{ currentYear }}年{{ currentMonth + 1 }}月</span>
          <button class="apple-date-nav" type="button" :disabled="!canGoNext" @click="nextMonth">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
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

        <!-- Weekday headers -->
        <div class="apple-date-weekdays">
          <span v-for="d in weekdays" :key="d">{{ d }}</span>
        </div>

        <!-- Days grid -->
        <div class="apple-date-grid">
          <template v-for="(day, i) in calendarDays" :key="i">
            <div
              v-if="day"
              class="apple-date-cell"
              :class="{
                'apple-date-cell--outside': !day.isCurrentMonth,
                'apple-date-cell--today': day.isToday,
                'apple-date-cell--selected': day.isSelected,
                'apple-date-cell--disabled': day.disabled
              }"
              @click="selectDay(day)"
            >
              <span class="apple-date-day-num">{{ day.day }}</span>
            </div>
            <div v-else class="apple-date-cell apple-date-cell--empty" />
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    disabledDate?: (date: Date) => boolean;
  }>(),
  {
    placeholder: '选择日期'
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [];
}>();

const wrapperRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const open = ref(false);
const currentYear = ref(new Date().getFullYear());
const currentMonth = ref(new Date().getMonth());
const panelStyle = ref({});
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const selectedDate = computed(() => {
  if (!props.modelValue) return null;
  const d = new Date(props.modelValue + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
});

const displayText = computed(() => {
  if (!props.modelValue) return '';
  const d = selectedDate.value;
  if (!d) return '';
  const wd = weekdayNames[d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${wd}`;
});

function isToday(date: Date) {
  const t = new Date();
  return (
    date.getFullYear() === t.getFullYear() &&
    date.getMonth() === t.getMonth() &&
    date.getDate() === t.getDate()
  );
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const calendarDays = computed(() => {
  const year = currentYear.value;
  const month = currentMonth.value;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay(); // 0=Sun

  const days: Array<{
    day: number;
    date: Date;
    isCurrentMonth: boolean;
    isToday: boolean;
    isSelected: boolean;
    disabled: boolean;
  } | null> = [];

  // Previous month fillers
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({
      day: d.getDate(),
      date: d,
      isCurrentMonth: false,
      isToday: false,
      isSelected: selectedDate.value ? isSameDay(d, selectedDate.value) : false,
      disabled: props.disabledDate ? props.disabledDate(d) : false
    });
  }

  // Current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month, i);
    days.push({
      day: i,
      date: d,
      isCurrentMonth: true,
      isToday: isToday(d),
      isSelected: selectedDate.value ? isSameDay(d, selectedDate.value) : false,
      disabled: props.disabledDate ? props.disabledDate(d) : false
    });
  }

  // Next month fillers to complete 6 rows (42 cells)
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({
      day: i,
      date: d,
      isCurrentMonth: false,
      isToday: false,
      isSelected: selectedDate.value ? isSameDay(d, selectedDate.value) : false,
      disabled: props.disabledDate ? props.disabledDate(d) : false
    });
  }

  return days;
});

const canGoPrev = computed(() => {
  if (!props.disabledDate) return true;
  return true; // we don't block navigation, individual days are disabled
});

const canGoNext = computed(() => {
  if (!props.disabledDate) return true;
  return true;
});

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

function selectDay(day: { date: Date; disabled: boolean; isCurrentMonth: boolean }) {
  if (day.disabled) return;
  const y = day.date.getFullYear();
  const m = String(day.date.getMonth() + 1).padStart(2, '0');
  const d = String(day.date.getDate()).padStart(2, '0');
  emit('update:modelValue', `${y}-${m}-${d}`);
  emit('change');
  close();
}

function toggleOpen() {
  if (open.value) {
    close();
  } else {
    openCalendar();
  }
}

function openCalendar() {
  if (props.modelValue) {
    const d = selectedDate.value;
    if (d) {
      currentYear.value = d.getFullYear();
      currentMonth.value = d.getMonth();
    }
  } else {
    const t = new Date();
    currentYear.value = t.getFullYear();
    currentMonth.value = t.getMonth();
  }
  open.value = true;
  nextTick(() => {
    positionPanel();
  });
}

function close() {
  open.value = false;
}

function positionPanel() {
  if (!wrapperRef.value || !panelRef.value) return;
  const trigger = wrapperRef.value.getBoundingClientRect();
  const panelHeight = panelRef.value.offsetHeight || 340;
  const viewportH = window.innerHeight;
  const spaceBelow = viewportH - trigger.bottom;
  const spaceAbove = trigger.top;

  let top: number;
  if (spaceBelow >= panelHeight + 8 || spaceBelow > spaceAbove) {
    top = trigger.bottom + 6;
  } else {
    top = trigger.top - panelHeight - 6;
  }

  const left = Math.min(trigger.left, window.innerWidth - 320);

  panelStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${Math.max(8, left)}px`
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
  if (e.key === 'Escape' && open.value) {
    close();
  }
}

watch(open, (val) => {
  if (val) {
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape);
  } else {
    document.removeEventListener('mousedown', handleClickOutside, true);
    document.removeEventListener('keydown', handleEscape);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside, true);
  document.removeEventListener('keydown', handleEscape);
});
</script>

<style scoped>
/* ===== Trigger button ===== */
.apple-date-picker {
  display: inline-block;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
}

.apple-date-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  background: #fff;
  color: #1d2939;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
  user-select: none;
  -webkit-user-select: none;
  white-space: nowrap;
}

.apple-date-trigger:hover {
  border-color: #c4c9d4;
  background: #fafbfc;
}

.apple-date-trigger:active {
  background: #f2f4f7;
  transform: scale(0.97);
}

.apple-date-icon {
  flex-shrink: 0;
  color: #667085;
}

.apple-date-value {
  color: #1d2939;
}

.apple-date-placeholder {
  color: #98a2b3;
  font-weight: 400;
}

/* ===== Overlay ===== */
.apple-date-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: transparent;
}

/* ===== Panel ===== */
.apple-date-panel {
  z-index: 1000;
  width: 280px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.98);
  border: 0.5px solid rgba(60, 60, 67, 0.08);
  border-radius: 16px;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.08),
    0 1px 4px rgba(0, 0, 0, 0.04),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(40px) saturate(140%);
  -webkit-backdrop-filter: blur(40px) saturate(140%);
  animation: apple-date-fadeIn 0.18s ease-out;
  transform-origin: top center;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
}

@keyframes apple-date-fadeIn {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ===== Header ===== */
.apple-date-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding: 0 2px;
}

.apple-date-title {
  font-size: 15px;
  font-weight: 600;
  color: #1d2939;
  letter-spacing: 0.01em;
}

.apple-date-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #667085;
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none;
}

.apple-date-nav:hover {
  background: rgba(60, 60, 67, 0.06);
  color: #1d2939;
}

.apple-date-nav:active {
  background: rgba(60, 60, 67, 0.1);
  transform: scale(0.92);
}

.apple-date-nav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  transform: none;
}

/* ===== Weekday headers ===== */
.apple-date-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 6px;
  text-align: center;
}

.apple-date-weekdays span {
  font-size: 12px;
  font-weight: 500;
  color: #98a2b3;
  line-height: 32px;
}

/* ===== Days grid ===== */
.apple-date-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.apple-date-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  cursor: pointer;
  border-radius: 999px;
  transition: all 0.12s ease;
  position: relative;
}

.apple-date-cell:hover:not(.apple-date-cell--empty):not(.apple-date-cell--disabled) {
  background: rgba(0, 122, 255, 0.08);
}

.apple-date-cell:active:not(.apple-date-cell--empty):not(.apple-date-cell--disabled) {
  transform: scale(0.9);
}

.apple-date-day-num {
  font-size: 14px;
  font-weight: 400;
  color: #1d2939;
  line-height: 1;
}

/* Selected */
.apple-date-cell--selected {
  background: #007aff !important;
}

.apple-date-cell--selected .apple-date-day-num {
  color: #fff;
  font-weight: 600;
}

/* Today */
.apple-date-cell--today:not(.apple-date-cell--selected) .apple-date-day-num {
  color: #007aff;
  font-weight: 600;
}

.apple-date-cell--today:not(.apple-date-cell--selected)::after {
  content: '';
  position: absolute;
  bottom: 4px;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: #007aff;
}

/* Outside month */
.apple-date-cell--outside .apple-date-day-num {
  color: #c4c9d4;
}

/* Disabled */
.apple-date-cell--disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.apple-date-cell--disabled:hover {
  background: transparent;
}

/* Empty fillers */
.apple-date-cell--empty {
  cursor: default;
}
</style>
