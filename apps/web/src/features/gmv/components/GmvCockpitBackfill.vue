<template>
  <div ref="rootRef" class="apple-menu">
    <AppleButton
      variant="secondary"
      size="sm"
      :loading="backfilling"
      data-testid="gmv-backfill"
      @click="open = !open"
    >
      {{ backfillLabel }}
      <svg
        class="apple-menu-chevron"
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
      <div v-if="open" class="apple-menu-overlay" @click="open = false" />
      <div v-if="open" class="apple-menu-panel" :style="panelStyle" role="menu">
        <button
          v-for="opt in options"
          :key="opt.days"
          type="button"
          class="apple-menu-item"
          role="menuitem"
          @click="pick(opt.days)"
        >
          {{ opt.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import AppleButton from '../../../components/AppleButton.vue';

defineProps<{ backfilling: boolean; backfillLabel: string }>();
const emit = defineEmits<{ backfill: [days: number] }>();

const options = [
  { days: 1, label: '重抓最近 1 天' },
  { days: 3, label: '重抓最近 3 天' },
  { days: 7, label: '重抓最近 7 天' },
  { days: 14, label: '重抓最近 14 天' },
  { days: 30, label: '重抓最近 30 天' }
];

const rootRef = ref<HTMLElement | null>(null);
const open = ref(false);
const panelStyle = ref<Record<string, string>>({});

function pick(days: number) {
  open.value = false;
  emit('backfill', days);
}

function position() {
  if (!rootRef.value) return;
  const r = rootRef.value.getBoundingClientRect();
  panelStyle.value = {
    position: 'fixed',
    top: `${r.bottom + 6}px`,
    left: `${Math.max(8, r.right - 180)}px`,
    minWidth: '168px'
  };
}

watch(open, async (v) => {
  if (v) {
    await nextTick();
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
  } else {
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', position);
  window.removeEventListener('scroll', position, true);
});
</script>

<style scoped>
.apple-menu {
  display: inline-flex;
  position: relative;
}

.apple-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: transparent;
}

.apple-menu-panel {
  z-index: 1000;
  padding: 6px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  border: 0.5px solid rgba(60, 60, 67, 0.12);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(30px) saturate(160%);
  -webkit-backdrop-filter: blur(30px) saturate(160%);
  animation: apple-menu-in 0.14s ease-out;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
}

@keyframes apple-menu-in {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.apple-menu-item {
  display: flex;
  width: 100%;
  appearance: none;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 9px 12px;
  border-radius: 8px;
  color: #1d1d1f;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  letter-spacing: -0.01em;
}

.apple-menu-item:hover {
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
}

.apple-menu-item:active {
  background: rgba(0, 122, 255, 0.16);
}

.apple-menu-chevron {
  margin-left: 2px;
  opacity: 0.7;
}
</style>
