<template>
  <section v-loading="loading" class="page-stack performance-console">
    <ErrorAlert :message="loadError" />

    <section class="panel review-hero">
      <div class="panel-head hero-head">
        <div>
          <p class="eyebrow">Performance Review</p>
          <h2>AI 复盘建议</h2>
          <p class="hero-copy">把昨天、今天和明天连起来看，优先找出能直接影响转化的动作。</p>
        </div>
        <el-tag effect="plain" type="success">{{ perf.review?.date || '最新复盘' }}</el-tag>
      </div>
      <div class="review-board">
        <article class="review-card">
          <span class="review-card-label">昨天发生了什么</span>
          <p v-for="item in perf.review?.whatHappened ?? []" :key="item">{{ item }}</p>
        </article>
        <article class="review-card">
          <span class="review-card-label">明天建议推什么</span>
          <p v-for="item in perf.review?.tomorrowSuggestions ?? []" :key="item">{{ item }}</p>
        </article>
        <article class="review-card review-card-highlight">
          <span class="review-card-label">高转化文案</span>
          <p v-for="item in perf.review?.highConversionCopies ?? []" :key="item.contentId">
            <strong>{{ item.title }}</strong>
            <span>{{ formatPercent(item.conversionRate) }}</span>
          </p>
        </article>
      </div>
    </section>

    <div class="dashboard-grid charts-grid">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>版本效果对比</h2>
            <p>观察不同文案版本的点击与下单差异。</p>
          </div>
        </div>
        <ChartPanel :option="versionOption" />
      </section>
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>渠道转化</h2>
            <p>看点击主要来自哪些渠道，帮助分配投放重心。</p>
          </div>
        </div>
        <ChartPanel :option="channelOption" />
      </section>
    </div>

    <section class="panel table-panel">
      <div class="panel-head">
        <div>
          <h2>推广效果明细</h2>
          <p>按文案、版本和渠道查看具体表现。</p>
        </div>
      </div>
      <el-table :data="perf.items ?? []" height="420" class="result-table">
        <el-table-column prop="title" label="文案" min-width="180" show-overflow-tooltip />
        <el-table-column prop="copyVersion" label="版本" width="72" />
        <el-table-column label="渠道" width="96">
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
import type { PerformanceResponse } from '@content/shared';
import ChartPanel from '../components/ChartPanel.vue';
import { api } from '../services/api';
import { channelLabels, percent as formatPercent } from '../utils/labels';
import { useApiFetch } from '../composables/useApiFetch';
import ErrorAlert from '../components/ErrorAlert.vue';

type PerformanceData = PerformanceResponse;

const {
  loading,
  data: performance,
  error: loadError,
  load
} = useApiFetch<PerformanceData>(() => api.getPerformance(), {
  errorMessage: '效果数据加载失败，请稍后重试',
  clearCacheOnForce: false
});

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
.performance-console {
  gap: 12px;
}

.page-alert {
  margin-bottom: 0;
}

.review-hero {
  background:
    radial-gradient(circle at top right, rgba(19, 78, 74, 0.08), transparent 30%),
    linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
}

.hero-head {
  align-items: flex-start;
  margin-bottom: 14px;
}

.hero-copy {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.review-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.review-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}

.review-card-label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.review-card p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.6;
}

.review-card-highlight {
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.9), #fff);
}

.review-card-highlight p {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.review-card-highlight strong {
  color: var(--ink);
}

.review-card-highlight span {
  color: var(--success);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.charts-grid .panel {
  min-height: 420px;
}

.table-panel {
  overflow: hidden;
}

.result-table {
  margin-top: 4px;
}

@media (max-width: 1280px) {
  .review-board {
    grid-template-columns: 1fr;
  }
}
</style>
