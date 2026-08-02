<template>
  <div ref="rootRef" class="backfill-menu">
    <AppleButton
      variant="secondary"
      size="sm"
      :loading="backfilling"
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

        <!-- 选项卡 -->
        <div class="backfill-panel__body" role="listbox">
          <button
            v-for="opt in options"
            :key="opt.days"
            type="button"
            class="backfill-option"
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
              抓取范围包含 {{ todayText }} 当天；切忌同时点"刷新"避免重复抓取
            </div>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import AppleButton from '../../../components/AppleButton.vue';

const { todayText = '' } = withDefaults(
  defineProps<{
    backfilling: boolean;
    backfillLabel: string;
    /** 当天日期文本（YYYY-MM-DD），用于提示文案；可选 */
    todayText?: string;
  }>(),
  {
    todayText: ''
  }
);
const emit = defineEmits<{ backfill: [days: number] }>();

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
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function pick(days: number) {
  open.value = false;
  emit('backfill', days);
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

watch(open, async (v) => {
  if (v) {
    await nextTick();
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.addEventListener('keydown', onKey);
  } else {
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    window.removeEventListener('keydown', onKey);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', position);
  window.removeEventListener('scroll', position, true);
  window.removeEventListener('keydown', onKey);
});
</script>

<style scoped>
.backfill-menu {
  display: inline-flex;
  position: relative;
}

.backfill-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: transparent;
}

.backfill-panel {
  z-index: 1000;
  display: flex;
  flex-direction: column;
  width: 432px;
  max-width: calc(100vw - 24px);
  max-height: min(520px, calc(100vh - 24px));
  padding: 0;
  border-radius: 18px;
  background: rgba(250, 250, 252, 0.96);
  border: 0.5px solid rgba(60, 60, 67, 0.14);
  box-shadow:
    0 22px 64px rgba(15, 23, 42, 0.16),
    0 5px 18px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
  animation: backfill-in 0.16s ease-out;
  overflow: hidden;
}

@keyframes backfill-in {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* —— 头部 —— */
.backfill-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 14px 11px;
  border-bottom: 0.5px solid rgba(60, 60, 67, 0.1);
}

.backfill-panel__title {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.backfill-panel__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.16), rgba(0, 122, 255, 0.04));
  color: #007aff;
  flex-shrink: 0;
  margin-top: 1px;
}

.backfill-panel__heading {
  min-width: 0;
}

.backfill-panel__name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1d1d1f;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.backfill-panel__subtitle {
  margin: 2px 0 0;
  font-size: 11.5px;
  font-weight: 450;
  color: #6e6e73;
  letter-spacing: -0.005em;
  line-height: 1.4;
}

.backfill-panel__hint {
  flex-shrink: 0;
  font-size: 10.5px;
  color: #98989d;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(120, 120, 128, 0.08);
  font-feature-settings: 'tnum';
}

/* —— 选项卡 —— */
.backfill-panel__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px;
  overflow-y: auto;
}

.backfill-option {
  appearance: none;
  display: grid;
  grid-template-columns: 40px 1fr 16px;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 8px 9px;
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: #1d1d1f;
  transition: background 0.12s ease;
}

.backfill-option:hover {
  background: rgba(0, 122, 255, 0.08);
}

.backfill-option:active {
  background: rgba(0, 122, 255, 0.14);
}

.backfill-option:focus-visible {
  outline: 2px solid rgba(0, 122, 255, 0.4);
  outline-offset: -2px;
}

.backfill-option.is-recommended {
  background: rgba(0, 122, 255, 0.04);
}

.backfill-option.is-recommended:hover {
  background: rgba(0, 122, 255, 0.1);
}

.backfill-option__badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 38px;
  border-radius: 11px;
  font-weight: 700;
  font-feature-settings: 'tnum';
  letter-spacing: -0.02em;
  flex-shrink: 0;
  line-height: 1;
}

.backfill-option__num {
  font-size: 15px;
}

.backfill-option__unit {
  font-size: 9.5px;
  font-weight: 600;
  margin-top: 1px;
  opacity: 0.78;
  letter-spacing: 0;
}

.backfill-option__badge[data-tone='blue'] {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.18), rgba(0, 122, 255, 0.06));
  color: #007aff;
}
.backfill-option__badge[data-tone='teal'] {
  background: linear-gradient(135deg, rgba(52, 199, 89, 0.2), rgba(52, 199, 89, 0.06));
  color: #28a745;
}
.backfill-option__badge[data-tone='amber'] {
  background: linear-gradient(135deg, rgba(255, 149, 0, 0.22), rgba(255, 149, 0, 0.06));
  color: #c93400;
}
.backfill-option__badge[data-tone='orange'] {
  background: linear-gradient(135deg, rgba(255, 149, 0, 0.28), rgba(255, 149, 0, 0.08));
  color: #b35800;
}
.backfill-option__badge[data-tone='rose'] {
  background: linear-gradient(135deg, rgba(255, 59, 48, 0.2), rgba(255, 59, 48, 0.06));
  color: #d70015;
}
.backfill-option__badge[data-tone='purple'] {
  background: linear-gradient(135deg, rgba(175, 82, 222, 0.2), rgba(175, 82, 222, 0.06));
  color: #af52de;
}

.backfill-option__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.backfill-option__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: #1d1d1f;
  letter-spacing: -0.01em;
  line-height: 1.35;
}

.backfill-option__tag {
  display: inline-flex;
  align-items: center;
  font-size: 9.5px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0, 122, 255, 0.14);
  color: #007aff;
  letter-spacing: 0;
}

.backfill-option__desc {
  font-size: 11px;
  font-weight: 450;
  color: #6e6e73;
  letter-spacing: -0.005em;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.backfill-option__chevron {
  color: #c7c7cc;
  flex-shrink: 0;
  transition:
    transform 0.12s ease,
    color 0.12s ease;
}

.backfill-option:hover .backfill-option__chevron {
  color: #007aff;
  transform: translateX(2px);
}

/* —— 分割线 —— */
.backfill-panel__divider {
  height: 0.5px;
  margin: 0 14px;
  background: linear-gradient(90deg, transparent, rgba(60, 60, 67, 0.16), transparent);
}

/* —— 状态区 —— */
.backfill-status {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 14px 11px;
}

.backfill-status__icon {
  color: #98989d;
  flex-shrink: 0;
  margin-top: 1px;
}

.backfill-status__body {
  min-width: 0;
}

.backfill-status__title {
  font-size: 11.5px;
  font-weight: 600;
  color: #3a3a3c;
  letter-spacing: -0.005em;
  line-height: 1.35;
}

.backfill-status__desc {
  font-size: 11px;
  font-weight: 450;
  color: #86868b;
  letter-spacing: -0.005em;
  line-height: 1.45;
  margin-top: 1px;
}

.backfill-status.is-active .backfill-status__title {
  color: #007aff;
}

.backfill-status__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #007aff;
  margin-top: 6px;
  margin-right: 2px;
  flex-shrink: 0;
  box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.14);
  position: relative;
}

.backfill-status__dot::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: #007aff;
  animation: backfill-pulse 1.4s ease-out infinite;
}

@keyframes backfill-pulse {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(2.4);
    opacity: 0;
  }
}

/* —— 触发器小图标 —— */
.backfill-chevron {
  margin-left: 2px;
  opacity: 0.7;
  transition: transform 0.15s ease;
}

.backfill-chevron.is-open {
  transform: rotate(180deg);
}

/* —— 暗色主题适配 —— */
:global([data-theme='dark']) .backfill-panel {
  background: rgba(28, 30, 38, 0.96);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow:
    0 18px 56px rgba(0, 0, 0, 0.6),
    0 4px 14px rgba(0, 0, 0, 0.4);
}

:global([data-theme='dark']) .backfill-panel__name,
:global([data-theme='dark']) .backfill-option__title {
  color: #f5f5f7;
}

:global([data-theme='dark']) .backfill-panel__subtitle,
:global([data-theme='dark']) .backfill-option__desc {
  color: #98989d;
}

:global([data-theme='dark']) .backfill-panel__header {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

:global([data-theme='dark']) .backfill-panel__divider {
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
}

:global([data-theme='dark']) .backfill-option__chevron {
  color: #48484a;
}

:global([data-theme='dark']) .backfill-option:hover {
  background: rgba(0, 122, 255, 0.16);
}

:global([data-theme='dark']) .backfill-status__title {
  color: #d1d1d6;
}

:global([data-theme='dark']) .backfill-status__desc {
  color: #6e6e73;
}

:global([data-theme='dark']) .backfill-status.is-active .backfill-status__title {
  color: #64a0ff;
}
</style>
