<script setup lang="ts">
import type { Component } from 'vue';
import { CreditCard, DataLine, Money, RefreshLeft, ShoppingBag } from '@element-plus/icons-vue';
import type {
  DataAnalysisDeltas,
  DataAnalysisOverview
} from '../../../services/api/data-analysis.api';
import { displayMoney, formatPercent } from '../../../utils/format';
import { formatDelta } from '../composables/useDataAnalysisPage';

const props = defineProps<{
  overview: DataAnalysisOverview | null;
  deltas: DataAnalysisDeltas | null;
}>();

type Tone = 'blue' | 'cyan' | 'indigo' | 'orange' | 'rose';

const cards: Array<{
  key: keyof DataAnalysisDeltas;
  label: string;
  tone: Tone;
  value: (o: DataAnalysisOverview | null) => string;
  icon: Component;
}> = [
  {
    key: 'salesAmount',
    label: '总销售额（实付）',
    tone: 'blue',
    value: (o) => displayMoney(o, 'salesAmount'),
    icon: ShoppingBag
  },
  {
    key: 'tradeAmount',
    label: '交易额（含余额）',
    tone: 'cyan',
    value: (o) => displayMoney(o, 'tradeAmount'),
    icon: CreditCard
  },
  {
    key: 'netSales',
    label: '净销售额',
    tone: 'indigo',
    value: (o) => displayMoney(o, 'netSales'),
    icon: Money
  },
  {
    key: 'refundAmount',
    label: '退款金额',
    tone: 'orange',
    value: (o) => displayMoney(o, 'refundAmount'),
    icon: RefreshLeft
  },
  {
    key: 'settlementRate',
    label: '整体结算率',
    tone: 'rose',
    value: (o) => formatPercent(o?.settlementRate),
    icon: DataLine
  }
];

function deltaOf(key: keyof DataAnalysisDeltas) {
  return formatDelta(props.deltas?.[key] ?? null);
}
</script>

<template>
  <div class="da-kpi-row">
    <article v-for="card in cards" :key="card.key" class="da-kpi-card" :class="`tone-${card.tone}`">
      <div class="da-kpi-main">
        <div class="da-kpi-copy">
          <span class="da-kpi-label">{{ card.label }}</span>
          <strong class="da-kpi-value">{{ card.value(overview) }}</strong>
          <span class="da-kpi-delta" :class="`is-${deltaOf(card.key).tone}`">
            较上周期 {{ deltaOf(card.key).text }}
          </span>
        </div>
        <div class="da-kpi-icon" aria-hidden="true">
          <el-icon><component :is="card.icon" /></el-icon>
        </div>
      </div>
    </article>
  </div>
</template>
