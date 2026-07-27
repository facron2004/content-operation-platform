<script setup lang="ts">
import type {
  DataAnalysisDeltas,
  DataAnalysisOverview
} from '../../../services/api/data-analysis.api';
import { formatGmv, formatPercent } from '../../../utils/format';
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
  icon: string;
}> = [
  {
    key: 'salesAmount',
    label: '总销售额（实付）',
    tone: 'blue',
    value: (o) => formatGmv(o?.salesAmount),
    icon: 'bag'
  },
  {
    key: 'tradeAmount',
    label: '交易额（含余额）',
    tone: 'cyan',
    value: (o) => formatGmv(o?.tradeAmount),
    icon: 'card'
  },
  {
    key: 'netSales',
    label: '净销售额',
    tone: 'indigo',
    value: (o) => formatGmv(o?.netSales),
    icon: 'yen'
  },
  {
    key: 'refundAmount',
    label: '退款金额',
    tone: 'orange',
    value: (o) => formatGmv(o?.refundAmount),
    icon: 'refund'
  },
  {
    key: 'settlementRate',
    label: '整体结算率',
    tone: 'rose',
    value: (o) => formatPercent(o?.settlementRate),
    icon: 'rate'
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
          <span v-if="card.icon === 'bag'">🛍</span>
          <span v-else-if="card.icon === 'card'">💳</span>
          <span v-else-if="card.icon === 'yen'">¥</span>
          <span v-else-if="card.icon === 'refund'">↩</span>
          <span v-else>%</span>
        </div>
      </div>
    </article>
  </div>
</template>
