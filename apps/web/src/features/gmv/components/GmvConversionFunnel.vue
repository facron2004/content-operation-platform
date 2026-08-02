<template>
  <section class="panel chart-card gmv-funnel-card">
    <header class="gmv-funnel-header">
      <h3>转化漏斗（今日）</h3>
    </header>
    <EmptyState
      v-if="stages.length === 0"
      title="暂无转化数据"
      description="订单支付和核销数据同步后自动计算转化漏斗"
    />
    <div v-else class="gmv-funnel-visual">
      <!-- Funnel pyramid visualization -->
      <div class="funnel-stack">
        <div
          v-for="(stage, idx) in stages"
          :key="stage.label"
          class="funnel-tier"
          :class="`tier-${idx}`"
          :style="{ background: stage.color, width: widthFor(stage) + '%' }"
        >
          <span class="funnel-tier-label">{{ stage.label }}</span>
          <strong class="funnel-tier-value">{{ formatNumber(stage.value) }}</strong>
        </div>
      </div>
      <!-- Detail rows -->
      <ul class="gmv-funnel-list">
        <li v-for="(stage, idx) in stages" :key="stage.label" class="gmv-funnel-row">
          <div class="gmv-funnel-meta-cell">
            <span class="gmv-funnel-stage-label">{{ stage.label }}</span>
            <span class="gmv-funnel-stage-value">{{ formatNumber(stage.value) }}</span>
          </div>
          <div class="gmv-funnel-bar-wrap">
            <div
              class="gmv-funnel-bar-fill"
              :style="{ width: widthFor(stage) + '%', background: stage.color }"
            />
          </div>
          <span class="gmv-funnel-rate">
            {{ idx === 0 ? '100%' : formatPercentRaw(stage.rate * 100) }}
          </span>
          <span v-if="idx > 0" class="gmv-funnel-delta" :class="deltaClass(stage)">
            较上阶 {{ stageDelta(stage) }}
          </span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatNumber, formatPercentRaw } from '../../../utils/format';
import EmptyState from '../../../components/EmptyState.vue';

type FunnelStage = {
  label: string;
  value: number;
  rate: number;
  color: string;
};

const props = defineProps<{ stages: FunnelStage[] }>();

const top = computed(() => props.stages[0]?.value ?? 0);

function widthFor(stage: FunnelStage) {
  if (!top.value) return 20;
  return Math.max(18, (stage.value / top.value) * 100);
}

function stageDelta(stage: FunnelStage): string {
  const pct = (stage.rate * 100).toFixed(1);
  return `${pct}%`;
}

function deltaClass(stage: FunnelStage): string {
  if (stage.rate >= 0.6) return 'delta-good';
  if (stage.rate >= 0.3) return 'delta-warn';
  return 'delta-bad';
}
</script>

<style scoped>
.gmv-funnel-card {
  padding: 18px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.gmv-funnel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.gmv-funnel-header h3 {
  margin: 0;
  color: #101828;
  font-size: 15px;
  font-weight: 700;
}

.gmv-funnel-visual {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Pyramid visual */
.funnel-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 0;
}

.funnel-tier {
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #fff;
  font-size: 12px;
  transition: width 300ms ease-out;
  max-width: 100%;
  min-width: 60px;
}

.tier-0 {
  background: linear-gradient(135deg, #2e90fa, #1d70e8);
}
.tier-1 {
  background: linear-gradient(135deg, #15b79e, #0ea57c);
}
.tier-2 {
  background: linear-gradient(135deg, #9e77ed, #8a5de6);
}
.tier-3 {
  background: linear-gradient(135deg, #f79009, #e07b00);
}

.funnel-tier-label {
  font-weight: 500;
  opacity: 0.9;
}

.funnel-tier-value {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

/* Detail list */
.gmv-funnel-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gmv-funnel-row {
  display: grid;
  grid-template-columns: 90px 1fr 48px auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.gmv-funnel-meta-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gmv-funnel-stage-label {
  color: #475467;
  font-size: 12px;
  font-weight: 600;
}

.gmv-funnel-stage-value {
  color: #101828;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.gmv-funnel-bar-wrap {
  position: relative;
  height: 22px;
  background: #f2f4f7;
  border-radius: 999px;
  overflow: hidden;
  min-width: 0;
}

.gmv-funnel-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 280ms ease-out;
  min-width: 0;
}

.gmv-funnel-rate {
  color: #667085;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.gmv-funnel-delta {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.delta-good {
  color: #12b76a;
}
.delta-warn {
  color: #f79009;
}
.delta-bad {
  color: #f04438;
}
</style>
