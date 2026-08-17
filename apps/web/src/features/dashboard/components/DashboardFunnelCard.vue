<template>
  <section class="dashboard-panel dashboard-funnel-card">
    <div class="dashboard-panel__header dashboard-panel__header--compact">
      <div>
        <div class="dashboard-section-label">04 / CONVERSION</div>
        <h2>交易漏斗</h2>
        <p>查看内容点击、支付和核销的真实转化链路。</p>
      </div>
      <button type="button" class="dashboard-text-action" @click="$emit('inspect')">
        查看转化分析
        <ArrowRight />
      </button>
    </div>
    <div class="dashboard-funnel">
      <div v-for="(stage, index) in stages" :key="stage.label" class="dashboard-funnel__row">
        <div class="dashboard-funnel__label">
          <span>{{ stage.label }}</span>
          <strong>{{ formatCount(stage.value) }}</strong>
        </div>
        <div class="dashboard-funnel__track">
          <span
            class="dashboard-funnel__bar"
            :style="{ width: `${widthFor(stage.value)}%`, background: stage.color }"
          />
        </div>
        <span v-if="index > 0" class="dashboard-funnel__rate">↓ {{ stage.rate.toFixed(1) }}%</span>
        <span v-else class="dashboard-funnel__rate dashboard-funnel__rate--muted">起始流量</span>
      </div>
    </div>
    <div v-if="stages.length" class="dashboard-funnel__insight">
      <span class="dashboard-funnel__insight-dot" />
      <span>统计口径：内容点击 → 支付订单 → 核销订单，转化率来自内容运营摘要。</span>
    </div>
    <div v-else class="dashboard-funnel__empty">暂无真实漏斗数据</div>
  </section>
</template>

<script setup lang="ts">
import { ArrowRight } from '@element-plus/icons-vue';
import type { DashboardFunnelStage } from '../operations-dashboard';

const props = defineProps<{ stages: DashboardFunnelStage[] }>();

defineEmits<{ inspect: [] }>();

const formatCount = (value: number) => Math.round(value).toLocaleString('zh-CN');
const topValue = () => props.stages[0]?.value || 1;
function widthFor(value: number) {
  return Math.max(8, (value / topValue()) * 100);
}
</script>

<style scoped>
.dashboard-funnel-card {
  padding: 18px 20px 16px;
}

.dashboard-panel__header--compact {
  margin-bottom: 22px;
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

.dashboard-text-action svg {
  width: 13px;
}

.dashboard-funnel {
  display: grid;
  gap: 14px;
}

.dashboard-funnel__row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) 70px;
  align-items: center;
  gap: 10px;
}

.dashboard-funnel__label {
  display: grid;
  gap: 3px;
  color: #738196;
  font-size: 11px;
}

.dashboard-funnel__label strong {
  color: #24354a;
  font-family: var(--font-numeric);
  font-size: 13px;
}

.dashboard-funnel__track {
  height: 13px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf2f7;
}

.dashboard-funnel__bar {
  display: block;
  height: 100%;
  min-width: 14px;
  border-radius: inherit;
  transition: width 260ms ease;
}

.dashboard-funnel__rate {
  color: #607086;
  font-family: var(--font-numeric);
  font-size: 10px;
  font-weight: 700;
  text-align: right;
}

.dashboard-funnel__rate--muted {
  color: #a5afbd;
  font-family: inherit;
  font-weight: 500;
}

.dashboard-funnel__insight {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 20px;
  padding: 10px 11px;
  border: 1px solid #d7e7fb;
  border-radius: 9px;
  background: #f4f8fe;
  color: #55708f;
  font-size: 11px;
  line-height: 1.5;
}

.dashboard-funnel__insight-dot {
  width: 6px;
  height: 6px;
  margin-top: 4px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #3b82f6;
}

@media (max-width: 560px) {
  .dashboard-funnel__row {
    grid-template-columns: 76px minmax(0, 1fr);
  }

  .dashboard-funnel__rate {
    grid-column: 2;
    text-align: left;
  }
}
</style>
