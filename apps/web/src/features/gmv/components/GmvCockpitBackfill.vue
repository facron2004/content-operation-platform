<template>
  <div ref="rootRef" class="backfill-menu">
    <AppleButton
      variant="secondary"
      size="sm"
      :loading="backfilling"
      :disabled="backfilling"
      data-testid="gmv-backfill"
      @click="toggle"
    >
      <template v-if="!backfilling" #icon>
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
          <path d="M3 21v-5h5" />
        </svg>
      </template>
      {{ backfillLabel }}
      <svg
        class="backfill-chevron"
        :class="{ 'is-open': open }"
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
    </AppleButton>

    <Teleport to="body">
      <div v-if="open" class="backfill-overlay" @click="close" />
      <div
        v-if="open"
        ref="panelRef"
        class="backfill-panel"
        :style="panelStyle"
        role="dialog"
        aria-label="历史回填"
      >
        <!-- 面板头部 -->
        <header class="backfill-panel__header">
          <div class="backfill-panel__title">
            <span class="backfill-panel__icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </span>
            <div class="backfill-panel__heading">
              <h3 class="backfill-panel__name">历史回填</h3>
              <p class="backfill-panel__subtitle">从 JeeSite 拉取订单到本地，并刷新所有 GMV 视图</p>
            </div>
          </div>
          <span class="backfill-panel__hint">Esc 关闭</span>
        </header>

        <!-- 按日期区间回填：选开始与结束日期，回填区间全部订单并重算汇总 -->
        <section class="backfill-date">
          <div class="backfill-date__head">
            <span class="backfill-date__label">按日期区间回填</span>
            <span class="backfill-date__hint">
              选择开始与结束日期，回填区间内所有订单并重算汇总
            </span>
          </div>
          <div class="backfill-date__row">
            <AppleDateRangePicker
              class="backfill-range-picker"
              :start="rangeStart || undefined"
              :end="rangeEnd || undefined"
              :disabled="backfilling"
              :disabled-date="disableFutureDate"
              placeholder="选择开始与结束日期"
              @change="onRangeChange"
            />
            <AppleButton
              variant="primary"
              size="sm"
              :disabled="!canPickRange || backfilling"
              :loading="backfilling"
              data-testid="gmv-backfill-date"
              @click="pickRange"
            >
              回填区间
            </AppleButton>
          </div>
        </section>

        <div class="backfill-panel__divider" aria-hidden="true" />

        <!-- 选项卡 -->
        <div class="backfill-panel__body" role="listbox">
          <div class="backfill-section-label">快捷范围（重抓最近 N 天）</div>
          <button
            v-for="opt in options"
            :key="opt.days"
            type="button"
            class="backfill-option"
            :disabled="backfilling"
            :class="{ 'is-recommended': opt.recommended }"
            role="option"
            :aria-selected="false"
            @click="pick(opt.days)"
          >
            <span class="backfill-option__badge" :data-tone="opt.tone">
              <span class="backfill-option__num">{{ opt.days }}</span>
              <span class="backfill-option__unit">天</span>
            </span>
            <span class="backfill-option__body">
              <span class="backfill-option__title">
                {{ opt.label }}
                <span v-if="opt.recommended" class="backfill-option__tag">推荐</span>
              </span>
              <span class="backfill-option__desc">{{ opt.description }}</span>
            </span>
            <svg
              class="backfill-option__chevron"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </button>
        </div>

        <!-- 分割线 -->
        <div class="backfill-panel__divider" aria-hidden="true" />

        <!-- 状态区 -->
        <section v-if="backfilling" class="backfill-status is-active" aria-live="polite">
          <span class="backfill-status__dot" aria-hidden="true" />
          <div class="backfill-status__body">
            <div class="backfill-status__title">{{ backfillLabel }}</div>
            <div class="backfill-status__desc">
              后台拉取 JeeSite 订单并刷新汇总，期间可继续浏览其他视图
            </div>
          </div>
        </section>
        <section v-else class="backfill-status is-idle">
          <svg
            class="backfill-status__icon"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          <div class="backfill-status__body">
            <div class="backfill-status__title">提示</div>
            <div class="backfill-status__desc">
              抓取范围包含 {{ todayText }} 当天；请勿同时点“同步所选日订单”，避免重复抓取
            </div>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AppleButton from '../../../components/AppleButton.vue';
import AppleDateRangePicker from '../../data-analysis/components/AppleDateRangePicker.vue';
import { useBackfillMenuLifecycle } from '../composables/useBackfillMenu';
import { dispatchGmvBackfillCommand } from '../composables/gmv-backfill-command';
import type { GmvBackfillRange } from '../composables/gmv-cockpit-core';

const {
  backfilling,
  todayText = '',
  disableFutureDate = () => false
} = defineProps<{
  backfilling: boolean;
  backfillLabel: string;
  /** 当天日期文本（YYYY-MM-DD），用于提示文案；可选 */
  todayText?: string;
  /** 禁用日期（如未来日期），透传给区间选择器 */
  disableFutureDate?: (date: Date) => boolean;
}>();
const emit = defineEmits<{
  backfill: [days: number];
  'backfill-date': [range: GmvBackfillRange];
}>();

/** 按日期区间回填所选区间（YYYY-MM-DD） */
const rangeStart = ref<string>('');
const rangeEnd = ref<string>('');
/** 区间选择器会自动归一化起止顺序，故只需两个端点都存在即可回填 */
const canPickRange = computed(() => !!rangeStart.value && !!rangeEnd.value);

/** 区间选择器确认回调：拿到 [start, end] 后本地暂存，由「回填区间」按钮触发实际回填 */
function onRangeChange(v: [string, string]) {
  rangeStart.value = v[0];
  rangeEnd.value = v[1];
}

type Option = {
  days: number;
  label: string;
  description: string;
  tone: 'blue' | 'teal' | 'amber' | 'orange' | 'rose' | 'purple';
  recommended?: boolean;
};

const options: Option[] = [
  {
    days: 1,
    label: '重抓最近 1 天',
    description: '仅当天数据,秒级完成,适合补漏',
    tone: 'blue'
  },
  {
    days: 3,
    label: '重抓最近 3 天',
    description: '近 3 天订单,用于覆盖最近一次失败',
    tone: 'teal'
  },
  {
    days: 7,
    label: '重抓最近 7 天',
    description: '近一周完整数据,日常使用最常见',
    tone: 'amber',
    recommended: true
  },
  {
    days: 14,
    label: '重抓最近 14 天',
    description: '两周维度,适合周复盘与异常追溯',
    tone: 'orange'
  },
  {
    days: 30,
    label: '重抓最近 30 天',
    description: '月度数据,耗时较长请勿中断',
    tone: 'rose'
  },
  {
    days: 90,
    label: '重抓最近 90 天',
    description: '季度数据,深度回填与长期趋势分析',
    tone: 'purple'
  }
];

const rootRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const open = ref(false);
const panelStyle = ref<Record<string, string>>({});

function toggle() {
  if (backfilling) return;
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function pick(days: number) {
  dispatchGmvBackfillCommand(backfilling, days, close, (value) => emit('backfill', value));
}

function pickRange() {
  if (!canPickRange.value) return;
  const dispatched = dispatchGmvBackfillCommand(
    backfilling,
    { startDate: rangeStart.value, endDate: rangeEnd.value },
    close,
    (value) => emit('backfill-date', value)
  );
  if (dispatched) {
    rangeStart.value = '';
    rangeEnd.value = '';
  }
}

function position() {
  if (!rootRef.value || !panelRef.value) return;
  const r = rootRef.value.getBoundingClientRect();
  const panel = panelRef.value;
  const PANEL_W = Math.min(panel.offsetWidth || 432, window.innerWidth - 24);
  const panelHeight = Math.min(panel.offsetHeight, window.innerHeight - 24);
  const MARGIN = 12;

  // 默认从按钮右边缘向左展开，超出右边界则右对齐到按钮
  let left = r.right - PANEL_W;
  if (left < MARGIN) left = MARGIN;
  if (left + PANEL_W + MARGIN > window.innerWidth) {
    left = Math.max(MARGIN, window.innerWidth - PANEL_W - MARGIN);
  }

  let top = r.bottom + 8;
  // 空间不足时改为按钮上方展开
  if (top + panelHeight + MARGIN > window.innerHeight) {
    top = Math.max(MARGIN, r.top - panelHeight - 8);
  }
  top = Math.min(top, window.innerHeight - panelHeight - MARGIN);

  panelStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${PANEL_W}px`
  };
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    open.value = false;
  }
}

useBackfillMenuLifecycle({
  open,
  position,
  onKey
});
</script>

<style scoped src="../../../styles/components/gmv-cockpit-backfill.css"></style>
