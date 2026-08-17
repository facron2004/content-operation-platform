<template>
  <section class="dashboard-panel dashboard-alerts-panel">
    <div class="dashboard-panel__header dashboard-panel__header--compact">
      <div>
        <div class="dashboard-section-label">07 / AI SIGNALS</div>
        <h2>今日异常与运营建议</h2>
        <p>系统先告诉你哪里有问题、为什么发生，以及现在可以做什么。</p>
      </div>
      <button type="button" class="dashboard-text-action" @click="$emit('open-all')">
        经营预警中心
        <ArrowRight />
      </button>
    </div>
    <div class="dashboard-alert-list">
      <article
        v-for="item in alerts"
        :key="item.id"
        class="dashboard-alert"
        :class="`is-${item.level}`"
      >
        <div class="dashboard-alert__marker">
          <Warning v-if="item.level !== 'opportunity'" />
          <TrendCharts v-else />
        </div>
        <div class="dashboard-alert__main">
          <div class="dashboard-alert__title-row">
            <strong>{{ item.title }}</strong>
            <span class="dashboard-alert__level">{{ levelLabel(item.level) }}</span>
          </div>
          <div class="dashboard-alert__metrics">
            <span>{{ item.metric }}</span>
            <span>{{ item.comparison }}</span>
            <strong>{{ item.change }}</strong>
          </div>
          <p>{{ item.reason }}</p>
          <small>AI 建议：{{ item.suggestion }}</small>
        </div>
        <button type="button" class="dashboard-alert__action" @click="$emit('action', item.id)">
          {{ item.action }}
          <ArrowRight />
        </button>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ArrowRight, TrendCharts, Warning } from '@element-plus/icons-vue';
import type { DashboardAlert } from '../operations-dashboard';

defineProps<{ alerts: DashboardAlert[] }>();

defineEmits<{
  action: [id: string];
  'open-all': [];
}>();

const levelLabel = (level: DashboardAlert['level']) =>
  level === 'high' ? '高风险' : level === 'medium' ? '中风险' : '机会';
</script>

<style scoped>
.dashboard-alerts-panel {
  padding: 18px 20px 16px;
}

.dashboard-panel__header--compact {
  margin-bottom: 14px;
}

.dashboard-text-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: #2f78d0;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}

.dashboard-text-action svg,
.dashboard-alert__action svg {
  width: 13px;
}

.dashboard-alert-list {
  display: grid;
  gap: 8px;
}

.dashboard-alert {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid #e8edf3;
  border-radius: 10px;
  background: #fcfdff;
}

.dashboard-alert.is-high {
  border-color: #f5d7d2;
  background: #fff9f7;
}

.dashboard-alert.is-medium {
  border-color: #f1e4c5;
  background: #fffdf7;
}

.dashboard-alert.is-opportunity {
  border-color: #d5e9e0;
  background: #f8fdfb;
}

.dashboard-alert__marker {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 9px;
  background: #fff0ee;
  color: #d96254;
}

.dashboard-alert__marker svg {
  width: 16px;
}

.is-medium .dashboard-alert__marker {
  background: #fff3da;
  color: #c88624;
}

.is-opportunity .dashboard-alert__marker {
  background: #e7f8ef;
  color: #1a9a70;
}

.dashboard-alert__main {
  min-width: 0;
}

.dashboard-alert__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dashboard-alert__title-row strong {
  color: #293a50;
  font-size: 13px;
}

.dashboard-alert__level {
  padding: 3px 6px;
  border-radius: 999px;
  background: #fff0ee;
  color: #d35e50;
  font-size: 9px;
  font-weight: 800;
}

.is-medium .dashboard-alert__level {
  background: #fff3da;
  color: #bd7b1c;
}

.is-opportunity .dashboard-alert__level {
  background: #e7f8ef;
  color: #168b68;
}

.dashboard-alert__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 7px;
  color: #7b8a9c;
  font-family: var(--font-numeric);
  font-size: 10px;
}

.dashboard-alert__metrics strong {
  color: #d35e50;
}

.is-medium .dashboard-alert__metrics strong {
  color: #c27b1c;
}

.is-opportunity .dashboard-alert__metrics strong {
  color: #168b68;
}

.dashboard-alert__main p {
  margin: 8px 0 0;
  color: #596b82;
  font-size: 11px;
  line-height: 1.5;
}

.dashboard-alert__main small {
  display: block;
  margin-top: 4px;
  color: #8997a8;
  font-size: 10px;
  line-height: 1.45;
}

.dashboard-alert__action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: center;
  padding: 6px 0 6px 10px;
  border: 0;
  background: transparent;
  color: #2f78d0;
  cursor: pointer;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

@media (max-width: 680px) {
  .dashboard-alert {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .dashboard-alert__action {
    grid-column: 2;
    justify-self: start;
    padding-left: 0;
  }
}
</style>
