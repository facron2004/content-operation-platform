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
import {
  buildDatePickerCalendarDays,
  parseDatePickerYmd,
  toDatePickerYmd,
  type DatePickerDayCell
} from '../../../utils/date-picker-core';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    disabledDate?: (date: Date) => boolean;
  }>(),
  {
    modelValue: '',
    placeholder: '选择日期',
    disabledDate: () => false
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
  return parseDatePickerYmd(props.modelValue);
});

const displayText = computed(() => {
  if (!props.modelValue) return '';
  const d = selectedDate.value;
  if (!d) return '';
  const wd = weekdayNames[d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${wd}`;
});

const selectedYmd = computed(() => {
  const date = selectedDate.value;
  return date ? toDatePickerYmd(date) : null;
});

const calendarDays = computed(() => {
  return buildDatePickerCalendarDays(currentYear.value, currentMonth.value, props.disabledDate).map(
    (day): (DatePickerDayCell & { isSelected: boolean }) | null => {
      if (!day) return null;
      return {
        ...day,
        // Keep the previous component contract: today is only marked in the current month.
        isToday: day.isCurrentMonth && day.isToday,
        isSelected: day.ymd === selectedYmd.value
      };
    }
  );
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

function selectDay(day: DatePickerDayCell) {
  if (day.disabled) return;
  emit('update:modelValue', toDatePickerYmd(day.date));
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

<style scoped src="../../../styles/components/apple-date-picker.css"></style>
