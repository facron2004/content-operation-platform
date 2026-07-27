<template>
  <section class="panel chart-card gmv-channel-card">
    <header class="gmv-channel-header">
      <h3>支付构成</h3>
      <span class="gmv-channel-meta">{{ rows.length }} 项</span>
    </header>
    <EmptyState
      v-if="rows.length === 0"
      title="暂无支付构成"
      description="订单数据同步后将自动生成支付构成分析"
    />
    <div v-else class="gmv-channel-table">
      <div class="gmv-channel-thead">
        <span>支付方式</span>
        <span class="align-right">GMV（元）</span>
        <span class="align-right">占比</span>
      </div>
      <ul class="gmv-channel-rows">
        <li v-for="row in rows" :key="row.name" class="gmv-channel-row">
          <div class="gmv-channel-name">
            <span class="legend-swatch" :style="{ background: row.color }" />
            <span>{{ row.name }}</span>
          </div>
          <div class="gmv-channel-value">
            <div class="gmv-channel-bar-track">
              <div
                class="gmv-channel-bar-fill"
                :style="{ width: row.share * 100 + '%', background: row.color }"
              />
            </div>
            <span class="gmv-channel-value-text">¥ {{ formatNumber(row.value) }}</span>
          </div>
          <div class="gmv-channel-share">{{ formatPercentRaw(row.share * 100) }}</div>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { formatNumber, formatPercentRaw } from '../../../utils/format';
import EmptyState from '../../../components/EmptyState.vue';

type ChannelRow = {
  name: string;
  value: number;
  share: number;
  color: string;
};

defineProps<{ rows: ChannelRow[] }>();
</script>

<style scoped>
.gmv-channel-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.gmv-channel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.gmv-channel-header h3 {
  margin: 0;
  color: #101828;
  font-size: 15px;
  font-weight: 700;
}

.gmv-channel-meta {
  color: #98a2b3;
  font-size: 12px;
}

.gmv-channel-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.gmv-channel-thead {
  display: grid;
  grid-template-columns: 1.1fr 1.6fr 0.7fr;
  gap: 12px;
  color: #98a2b3;
  font-size: 12px;
  font-weight: 600;
  padding: 0 2px;
}

.align-right {
  text-align: right;
}

.gmv-channel-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.gmv-channel-row {
  display: grid;
  grid-template-columns: 1.1fr 1.6fr 0.7fr;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.gmv-channel-name {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #344054;
  font-size: 13px;
  font-weight: 600;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
  flex-shrink: 0;
}

.gmv-channel-value {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.gmv-channel-bar-track {
  position: relative;
  width: 100%;
  height: 8px;
  background: #f2f4f7;
  border-radius: 999px;
  overflow: hidden;
}

.gmv-channel-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 240ms ease-out;
}

.gmv-channel-value-text {
  color: #101828;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.gmv-channel-share {
  color: #475467;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
