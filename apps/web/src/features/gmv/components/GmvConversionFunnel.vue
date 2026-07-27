<template>
  <section class="panel chart-card gmv-funnel-card">
    <header class="gmv-funnel-header">
      <h3>支付→核销漏斗</h3>
      <span class="gmv-funnel-meta">核销率 {{ formatPercentRaw(topRate * 100) }}</span>
    </header>
    <EmptyState
      v-if="stages.length === 0"
      title="暂无转化数据"
      description="订单支付和核销数据同步后自动计算转化漏斗"
    />
    <ul v-else class="gmv-funnel-list">
      <li v-for="(stage, idx) in stages" :key="stage.label" class="gmv-funnel-row">
        <div class="gmv-funnel-meta-cell">
          <span class="gmv-funnel-stage-label">{{ stage.label }}</span>
          <span class="gmv-funnel-stage-value">¥ {{ formatNumber(stage.value) }}</span>
        </div>
        <div class="gmv-funnel-bar">
          <div
            class="gmv-funnel-bar-fill"
            :style="{
              width: widthFor(stage) + '%',
              background: stage.color
            }"
          >
            <span class="gmv-funnel-rate">
              {{ idx === 0 ? '100%' : formatPercentRaw(stage.rate * 100) }}
            </span>
          </div>
        </div>
      </li>
    </ul>
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
/** 头部展示核销率：优先取「核销」阶段，否则退回末级 rate */
const topRate = computed(() => {
  if (props.stages.length === 0) return 0;
  const verify = props.stages.find((s) => s.label === '核销');
  return (verify ?? props.stages[props.stages.length - 1])?.rate ?? 0;
});

function widthFor(stage: FunnelStage) {
  if (!top.value) return 0;
  return Math.max(8, (stage.value / top.value) * 100);
}
</script>

<style scoped>
.gmv-funnel-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.gmv-funnel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.gmv-funnel-header h3 {
  margin: 0;
  color: #101828;
  font-size: 15px;
  font-weight: 700;
}

.gmv-funnel-meta {
  color: #667085;
  font-size: 12px;
  font-weight: 600;
}

.gmv-funnel-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.gmv-funnel-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 12px;
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
  font-size: 13px;
  font-weight: 600;
}

.gmv-funnel-stage-value {
  color: #101828;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.gmv-funnel-bar {
  position: relative;
  height: 28px;
  background: #f2f4f7;
  border-radius: 999px;
  overflow: hidden;
}

.gmv-funnel-bar-fill {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 10px;
  border-radius: 999px;
  transition: width 280ms ease-out;
  min-width: 0;
}

.gmv-funnel-rate {
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
