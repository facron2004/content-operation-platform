<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import type {
  DataAnalysisChannelSlice,
  DataAnalysisDeltas,
  DataAnalysisOverview
} from '../../../services/api/data-analysis.api';
import { displayMoney, formatNumber, formatPercent } from '../../../utils/format';
import { formatDelta } from '../composables/useDataAnalysisPage';

const ChartPanel = defineAsyncComponent(() => import('../../../components/ChartPanel.vue'));

const props = defineProps<{
  dailyTrendOption: Record<string, unknown>;
  channelOption: Record<string, unknown>;
  channels: DataAnalysisChannelSlice[];
  overview: DataAnalysisOverview | null;
  deltas: DataAnalysisDeltas | null;
}>();

const keyMetrics: Array<{
  key: keyof DataAnalysisDeltas;
  label: string;
  value: (o: DataAnalysisOverview | null) => string;
  icon: string;
  tone: string;
}> = [
  {
    key: 'orderCount',
    label: '支付订单数',
    value: (o) => formatNumber(o?.orderCount, 0),
    icon: 'orders',
    tone: 'blue'
  },
  {
    key: 'avgOrderValue',
    label: '净客单价',
    value: (o) => displayMoney(o, 'avgOrderValue'),
    icon: 'aov',
    tone: 'indigo'
  },
  {
    key: 'verifyRate',
    label: '核销率',
    value: (o) => formatPercent(o?.verifyRate),
    icon: 'verify',
    tone: 'green'
  },
  {
    key: 'refundRate',
    label: '退款率',
    value: (o) => formatPercent(o?.refundRate),
    icon: 'refund',
    tone: 'sky'
  }
];

function deltaOf(key: keyof DataAnalysisDeltas) {
  return formatDelta(props.deltas?.[key] ?? null);
}

const channelPalette = ['#2563eb', '#14b8a6', '#f59e0b', '#ec4899', '#94a3b8'];
</script>

<template>
  <div class="da-mid-row">
    <section class="panel da-chart-card da-trend">
      <header>
        <h3>销售趋势</h3>
        <span class="da-pill">按日</span>
      </header>
      <ChartPanel v-if="Object.keys(dailyTrendOption).length" :option="dailyTrendOption" />
      <div v-else class="da-empty da-empty--compact">
        <p>暂无趋势数据</p>
      </div>
    </section>

    <section class="panel da-chart-card da-channel">
      <header>
        <h3>渠道销售占比</h3>
      </header>
      <div class="da-channel-body">
        <div class="da-channel-chart">
          <ChartPanel v-if="Object.keys(channelOption).length" :option="channelOption" />
          <div v-else class="da-empty da-empty--compact">
            <p>暂无渠道数据</p>
          </div>
          <div v-if="channels.length" class="da-channel-center">
            <span>总销售额</span>
            <strong>{{ displayMoney(overview, 'salesAmount') }}</strong>
          </div>
        </div>
        <ul v-if="channels.length" class="da-channel-legend">
          <li v-for="(c, i) in channels" :key="c.label + i">
            <span class="dot" :style="{ background: channelPalette[i % channelPalette.length] }" />
            <span class="name">{{ c.label }}</span>
            <span class="share">{{ formatPercent(c.share) }}</span>
            <span class="amt">{{ displayMoney(c, 'salesAmount') }}</span>
          </li>
        </ul>
      </div>
    </section>

    <section class="panel da-chart-card da-keys">
      <header>
        <h3>关键指标概览</h3>
      </header>
      <ul class="da-key-list">
        <li v-for="m in keyMetrics" :key="m.key" :class="`tone-${m.tone}`">
          <div class="da-key-icon" aria-hidden="true">
            <span v-if="m.icon === 'orders'">☰</span>
            <span v-else-if="m.icon === 'aov'">¥</span>
            <span v-else-if="m.icon === 'verify'">✓</span>
            <span v-else>↩</span>
          </div>
          <div class="da-key-copy">
            <span class="label">{{ m.label }}</span>
            <strong>{{ m.value(overview) }}</strong>
          </div>
          <span class="da-key-delta" :class="`is-${deltaOf(m.key).tone}`">
            较上周期 {{ deltaOf(m.key).text }}
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
