<template>
  <section class="panel chart-card gmv-activity-card">
    <header class="gmv-activity-header">
      <h3>活动效果分析</h3>
      <a class="gmv-activity-more" href="javascript:void(0)">更多 ›</a>
    </header>
    <div v-if="rows.length === 0" class="gmv-activity-empty">暂无活动数据</div>
    <div v-else class="gmv-activity-table">
      <div class="gmv-activity-thead">
        <span>活动名称</span>
        <span>活动时间</span>
        <span class="align-right">GMV（元）</span>
        <span class="align-right">ROI</span>
        <span class="align-right">核销率</span>
      </div>
      <ul class="gmv-activity-rows">
        <li v-for="row in rows" :key="row.name" class="gmv-activity-row">
          <span class="gmv-activity-name">{{ row.name }}</span>
          <span class="gmv-activity-date">{{ row.dateRange }}</span>
          <span class="align-right gmv-activity-value">¥ {{ formatNumber(row.gmv) }}</span>
          <span class="align-right" :class="roiClass(row.roi)">{{ row.roi.toFixed(2) }}</span>
          <span class="align-right" :class="verifyClass(row.verifyRate)">
            {{ formatPercentRaw(row.verifyRate * 100) }}
          </span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { formatNumber, formatPercentRaw } from '../../../utils/format';

type ActivityRow = {
  name: string;
  dateRange: string;
  gmv: number;
  roi: number;
  verifyRate: number;
};

defineProps<{ rows: ActivityRow[] }>();

function roiClass(roi: number) {
  if (roi >= 3) return 'value-strong';
  if (roi >= 2) return 'value-ok';
  return 'value-warn';
}

function verifyClass(rate: number) {
  if (rate >= 0.87) return 'value-strong';
  if (rate >= 0.8) return 'value-ok';
  return 'value-warn';
}
</script>

<style scoped>
.gmv-activity-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.gmv-activity-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.gmv-activity-header h3 {
  margin: 0;
  color: #101828;
  font-size: 15px;
  font-weight: 700;
}

.gmv-activity-more {
  color: #667085;
  font-size: 12px;
  text-decoration: none;
}
.gmv-activity-more:hover {
  color: #2e90fa;
}

.gmv-activity-empty {
  flex: 1;
  min-height: 140px;
  display: grid;
  place-items: center;
  color: #98a2b3;
  font-size: 13px;
  background: #f9fafb;
  border-radius: 10px;
}

.gmv-activity-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.gmv-activity-thead {
  display: grid;
  grid-template-columns: 1.2fr 1.1fr 1fr 0.6fr 0.7fr;
  gap: 12px;
  color: #98a2b3;
  font-size: 12px;
  font-weight: 600;
  padding: 0 2px;
}

.align-right {
  text-align: right;
}

.gmv-activity-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.gmv-activity-row {
  display: grid;
  grid-template-columns: 1.2fr 1.1fr 1fr 0.6fr 0.7fr;
  gap: 12px;
  align-items: center;
  padding: 8px 2px;
  border-radius: 8px;
  font-size: 13px;
  color: #344054;
  transition: background-color 120ms;
}

.gmv-activity-row:hover {
  background: #f9fafb;
}

.gmv-activity-name {
  font-weight: 600;
  color: #101828;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gmv-activity-date {
  color: #667085;
}

.gmv-activity-value {
  color: #101828;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.value-strong {
  color: #12b76a;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.value-ok {
  color: #101828;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.value-warn {
  color: #f79009;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
