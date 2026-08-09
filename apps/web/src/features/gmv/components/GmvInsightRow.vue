<template>
  <section class="insight-row">
    <article
      v-for="item in insights"
      :key="item.key"
      class="insight-card"
      :class="`tone-${item.tone}`"
    >
      <div class="insight-icon">
        <el-icon><component :is="item.icon" /></el-icon>
      </div>
      <div class="insight-body">
        <span class="insight-title">{{ item.title }}</span>
        <span class="insight-desc">{{ item.desc }}</span>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import type { GmvInsightItem } from '../composables/gmv-insights';

defineProps<{
  insights: GmvInsightItem[];
}>();
</script>

<style scoped>
.insight-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  min-width: 0;
  max-width: 100%;
}

.insight-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-soft);
  transition:
    box-shadow 200ms ease,
    transform 150ms ease;
}

.insight-card:hover {
  box-shadow: var(--shadow-elevated);
  transform: translateY(-1px);
}

.insight-icon {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 18px;
}

.tone-blue .insight-icon {
  color: #2e90fa;
  background: rgba(46, 144, 250, 0.1);
}

.tone-orange .insight-icon {
  color: #f79009;
  background: rgba(247, 144, 9, 0.1);
}

.tone-green .insight-icon {
  color: #12b76a;
  background: rgba(18, 183, 106, 0.1);
}

.tone-purple .insight-icon {
  color: #9e77ed;
  background: rgba(158, 119, 237, 0.1);
}

.insight-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.insight-title {
  color: #101828;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.insight-desc {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}

@media (max-width: 1280px) {
  .insight-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .insight-row {
    grid-template-columns: 1fr;
  }
}
</style>
