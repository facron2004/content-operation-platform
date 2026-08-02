<template>
  <section class="panel chart-card gmv-alerts-card">
    <header class="gmv-alerts-header">
      <h3>异常预警</h3>
      <a class="gmv-alerts-more" href="javascript:void(0)">查看全部 ›</a>
    </header>
    <EmptyState
      v-if="alerts.length === 0"
      title="暂无异常预警"
      description="一切正常，有异常指标时将自动显示预警"
    />
    <ul v-else class="gmv-alerts-list">
      <li
        v-for="alert in alerts"
        :key="alert.id"
        class="gmv-alerts-item"
        :class="`tone-${alert.tone}`"
      >
        <div class="gmv-alerts-badge" :class="`badge-${alert.tone}`">
          {{ badgeLabel(alert.tone) }}
        </div>
        <div class="gmv-alerts-body">
          <div class="gmv-alerts-title">{{ alert.title }}</div>
          <div class="gmv-alerts-desc">{{ alert.desc || '请关注' }}</div>
        </div>
        <span class="gmv-alerts-time">{{ alert.time }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import EmptyState from '../../../components/EmptyState.vue';

type AlertTone = 'danger' | 'warning' | 'info' | 'success';

type AlertItem = {
  id: string;
  region?: string;
  title: string;
  desc?: string;
  time: string;
  tone: AlertTone;
};

defineProps<{ alerts: AlertItem[] }>();

function badgeLabel(tone: AlertTone): string {
  switch (tone) {
    case 'danger':
      return '高风险';
    case 'warning':
      return '中风险';
    case 'info':
      return '提示';
    case 'success':
      return '正常';
    default:
      return '未知';
  }
}
</script>

<style scoped>
.gmv-alerts-card {
  padding: 18px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.gmv-alerts-header {
  display: flex;
  align-items: center;
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

.gmv-alerts-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.gmv-alerts-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #f9fafb;
  border-left: 3px solid transparent;
  transition:
    background-color 120ms,
    transform 150ms;
}

.gmv-alerts-item:hover {
  background: #f2f4f7;
  transform: translateX(2px);
}

/* Tone-based left border and badge colors */
.tone-danger .gmv-alerts-item {
  border-left-color: #f04438;
}
.tone-warning .gmv-alerts-item {
  border-left-color: #f79009;
}
.tone-info .gmv-alerts-item {
  border-left-color: #2e90fa;
}
.tone-success .gmv-alerts-item {
  border-left-color: #12b76a;
}

.gmv-alerts-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
  line-height: 1.4;
}

.badge-danger {
  color: #fff;
  background: linear-gradient(135deg, #f04438, #d92728);
}

.badge-warning {
  color: #fff;
  background: linear-gradient(135deg, #f79009, #e07b00);
}

.badge-info {
  color: #fff;
  background: linear-gradient(135deg, #2e90fa, #1d70e8);
}

.badge-success {
  color: #fff;
  background: linear-gradient(135deg, #12b76a, #0a9d58);
}

.gmv-alerts-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.gmv-alerts-title {
  color: #101828;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
}

.gmv-alerts-desc {
  color: #667085;
  font-size: 12px;
  line-height: 1.35;
}

.gmv-alerts-time {
  color: #98a2b3;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  padding-top: 2px;
}
</style>
