<template>
  <section class="panel chart-card gmv-alerts-card">
    <header class="gmv-alerts-header">
      <h3>异常预警</h3>
      <a class="gmv-alerts-more" href="javascript:void(0)">更多 ›</a>
    </header>
    <div v-if="alerts.length === 0" class="gmv-alerts-empty">暂无异常预警</div>
    <ul v-else class="gmv-alerts-list">
      <li
        v-for="alert in alerts"
        :key="alert.id"
        class="gmv-alerts-item"
        :class="`tone-${alert.tone}`"
      >
        <div class="gmv-alerts-icon">
          <el-icon><component :is="iconFor(alert.tone)" /></el-icon>
        </div>
        <div class="gmv-alerts-body">
          <div class="gmv-alerts-title">{{ alert.region }} · {{ alert.title }}</div>
          <div class="gmv-alerts-meta">请关注</div>
        </div>
        <span class="gmv-alerts-time">{{ alert.time }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { TrendCharts, Warning, CircleClose } from '@element-plus/icons-vue';

type AlertTone = 'danger' | 'warning' | 'info';

type AlertItem = {
  id: string;
  region: string;
  title: string;
  time: string;
  tone: AlertTone;
};

defineProps<{ alerts: AlertItem[] }>();

function iconFor(tone: AlertTone) {
  switch (tone) {
    case 'danger':
      return CircleClose;
    case 'warning':
      return Warning;
    default:
      return TrendCharts;
  }
}
</script>

<style scoped>
.gmv-alerts-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.gmv-alerts-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.gmv-alerts-header h3 {
  margin: 0;
  color: #101828;
  font-size: 15px;
  font-weight: 700;
}

.gmv-alerts-more {
  color: #667085;
  font-size: 12px;
  text-decoration: none;
}
.gmv-alerts-more:hover {
  color: #2e90fa;
}

.gmv-alerts-empty {
  flex: 1;
  min-height: 140px;
  display: grid;
  place-items: center;
  color: #98a2b3;
  font-size: 13px;
  background: #f9fafb;
  border-radius: 10px;
}

.gmv-alerts-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.gmv-alerts-item {
  display: grid;
  grid-template-columns: 32px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  background: #f9fafb;
  transition: background-color 120ms;
}

.gmv-alerts-item:hover {
  background: #f2f4f7;
}

.gmv-alerts-icon {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 16px;
}

.tone-danger .gmv-alerts-icon {
  color: #f04438;
  background: rgba(240, 68, 56, 0.12);
}

.tone-warning .gmv-alerts-icon {
  color: #f79009;
  background: rgba(247, 144, 9, 0.14);
}

.tone-info .gmv-alerts-icon {
  color: #2e90fa;
  background: rgba(46, 144, 250, 0.12);
}

.gmv-alerts-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gmv-alerts-title {
  color: #101828;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gmv-alerts-meta {
  color: #667085;
  font-size: 12px;
}

.gmv-alerts-time {
  color: #98a2b3;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
