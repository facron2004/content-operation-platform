<template>
  <section v-loading="loading" class="page-stack">
    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      show-icon
      closable
      style="margin-bottom: 12px"
    />
    <section class="panel">
      <div class="panel-head">
        <h2>AI 复盘建议</h2>
      </div>
      <div class="review-board">
        <div>
          <strong>昨天发生了什么</strong>
          <p v-for="item in perf.review?.whatHappened ?? []" :key="item">{{ item }}</p>
        </div>
        <div>
          <strong>明天建议推什么</strong>
          <p v-for="item in perf.review?.tomorrowSuggestions ?? []" :key="item">
            {{ item }}
          </p>
        </div>
        <div>
          <strong>高转化文案</strong>
          <p v-for="item in perf.review?.highConversionCopies ?? []" :key="item.contentId">
            {{ item.title }} / {{ formatPercent(item.conversionRate) }}
          </p>
        </div>
      </div>
    </section>

    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-head">
          <h2>版本效果对比</h2>
        </div>
        <ChartPanel :option="versionOption" />
      </section>
      <section class="panel">
        <div class="panel-head">
          <h2>渠道转化</h2>
        </div>
        <ChartPanel :option="channelOption" />
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <h2>推广效果明细</h2>
      </div>
      <el-table :data="perf.items ?? []" height="420">
        <el-table-column prop="title" label="文案" min-width="180" show-overflow-tooltip />
        <el-table-column prop="copyVersion" label="版本" width="64" />
        <el-table-column label="渠道" width="90">
          <template #default="{ row }">{{ channelLabels[row.channel] }}</template>
        </el-table-column>
        <el-table-column prop="clickCount" label="点击" width="72" />
        <el-table-column prop="orderCount" label="下单" width="72" />
        <el-table-column prop="verifyCount" label="核销" width="72" />
        <el-table-column prop="refundCount" label="退款" width="72" />
        <el-table-column prop="gmv" label="GMV" width="90" />
        <el-table-column label="转化率" width="90">
          <template #default="{ row }">{{ formatPercent(row.conversionRate) }}</template>
        </el-table-column>
      </el-table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { Channel } from '@content/shared';
import ChartPanel from '../components/ChartPanel.vue';
import { api } from '../services/api';
import { channelLabels, percent as formatPercent } from '../utils/labels';
import { useApiFetch } from '../composables/useApiFetch';

interface PerformanceItem {
  title: string;
  copyVersion: string;
  channel: Channel;
  clickCount: number;
  orderCount: number;
  verifyCount: number;
  refundCount: number;
  gmv: number;
  conversionRate: number;
}

interface VersionComparison {
  copyVersion: string;
  titleDirection: string;
  clickCount: number;
  orderCount: number;
  verifyCount: number;
  conversionRate: number;
}

interface DailyReview {
  date: string;
  whatHappened: string[];
  tomorrowSuggestions: string[];
  highConversionCopies: Array<{ contentId: string; title: string; conversionRate: number }>;
}

interface PerformanceData {
  items: PerformanceItem[];
  versionComparison: VersionComparison[];
  review: DailyReview;
}

const {
  loading,
  data: performance,
  error: loadError,
  load
} = useApiFetch<PerformanceData>(
  // 后端响应实际携带 verifyCount/refundCount 但 PerformanceResponse 类型未声明,
  // 临时走 unknown 转换;TODO: 同步 shared/api-types.ts 的字段定义
  () => api.getPerformance() as unknown as Promise<PerformanceData>,
  { errorMessage: '效果数据加载失败，请稍后重试', clearCacheOnForce: false }
);

const perf = computed<PerformanceData>(
  () =>
    performance.value ?? {
      items: [],
      versionComparison: [],
      review: { date: '', whatHappened: [], tomorrowSuggestions: [], highConversionCopies: [] }
    }
);

const versionOption = computed(() => {
  const rows = perf.value.versionComparison;
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 38, right: 18, top: 40, bottom: 32 },
    xAxis: { type: 'category', data: rows.map((row) => row.copyVersion) },
    yAxis: { type: 'value' },
    series: [
      {
        name: '点击',
        type: 'bar',
        data: rows.map((row) => row.clickCount),
        itemStyle: { color: '#2f6f73' }
      },
      {
        name: '下单',
        type: 'bar',
        data: rows.map((row) => row.orderCount),
        itemStyle: { color: '#d18b34' }
      }
    ]
  };
});

const channelOption = computed(() => {
  const grouped = perf.value.items.reduce((acc: Record<string, number>, row) => {
    const label = channelLabels[row.channel] ?? row.channel;
    acc[label] = (acc[label] ?? 0) + row.clickCount;
    return acc;
  }, {});
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        data: Object.entries(grouped).map(([name, value]) => ({ name, value }))
      }
    ]
  };
});

onMounted(load);
</script>

<style scoped>
.review-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.review-board div {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.review-board strong {
  display: block;
  margin-bottom: 8px;
}

.review-board p {
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.5;
}
</style>
