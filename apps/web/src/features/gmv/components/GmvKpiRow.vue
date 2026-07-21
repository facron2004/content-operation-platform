<script setup lang="ts">
import type { GmvKpi } from '../../../services/api/gmv.api';
import {
  Coin,
  Calendar,
  Document,
  Wallet,
  CircleCheck,
  Warning,
  Money
} from '@element-plus/icons-vue';
import { formatCount, formatGmv, formatNumber, formatPercent } from '../../../utils/format';

defineProps<{
  kpi: GmvKpi | null;
}>();

type Tone = 'blue' | 'cyan' | 'indigo' | 'purple' | 'green' | 'orange' | 'sky';

type BreakdownRow = { label: string; value: number; color: string };

function buildBreakdown(
  kpi: GmvKpi | null,
  total: number | undefined,
  online: number | undefined,
  wallet: number | undefined
): BreakdownRow[] {
  if (!kpi || !total || total <= 0) return [];
  return [
    { label: '余额', value: Number(wallet ?? 0), color: '#16b79e' },
    { label: '现金', value: Number(online ?? 0), color: '#2e90fa' }
  ];
}

function deltaMeta(ratio: number | null | undefined, invert = false) {
  if (ratio == null || !Number.isFinite(ratio)) {
    return { text: '—', tone: 'flat' as const };
  }
  const pct = Math.abs(ratio * 100).toFixed(2);
  if (Math.abs(ratio) <= 0.0005) {
    return { text: '较昨日 → 0.00%', tone: 'flat' as const };
  }
  const up = ratio > 0;
  const good = invert ? !up : up;
  return {
    text: `较昨日 ${up ? '↑' : '↓'} ${pct}%`,
    tone: good ? ('up' as const) : ('down' as const)
  };
}

const cards: Array<{
  key: string;
  label: string;
  tone: Tone;
  icon: unknown;
  value: (kpi: GmvKpi | null) => string;
  delta?: (kpi: GmvKpi | null) => ReturnType<typeof deltaMeta>;
  breakdown?: (kpi: GmvKpi | null) => BreakdownRow[];
}> = [
  {
    key: 'today',
    label: '今日GMV',
    tone: 'blue',
    icon: Coin,
    value: (k) => formatGmv(k?.totalGmv),
    delta: (k) => deltaMeta(k?.compare?.totalGmv),
    breakdown: (k) => buildBreakdown(k, k?.totalGmv, k?.gmvOnline, k?.gmvWallet)
  },
  {
    key: 'month',
    label: '本月GMV',
    tone: 'cyan',
    icon: Calendar,
    value: (k) => formatGmv(k?.monthGmv),
    delta: (k) => deltaMeta(k?.compare?.monthGmv ?? null),
    breakdown: (k) => buildBreakdown(k, k?.monthGmv, k?.monthGmvOnline, k?.monthGmvWallet)
  },
  {
    key: 'orders',
    label: '支付订单数',
    tone: 'indigo',
    icon: Document,
    value: (k) => formatCount(k?.paidOrderCount),
    delta: (k) => deltaMeta(k?.compare?.paidOrderCount)
  },
  {
    key: 'aov',
    label: '客单价',
    tone: 'purple',
    icon: Wallet,
    value: (k) => formatGmv(k?.avgOrderValue),
    delta: (k) => deltaMeta(k?.compare?.avgOrderValue)
  },
  {
    key: 'verify',
    label: '核销率',
    tone: 'green',
    icon: CircleCheck,
    value: (k) => formatPercent(k?.verifyRate),
    delta: (k) => deltaMeta(k?.compare?.verifyRate)
  },
  {
    key: 'refund',
    label: '退款率',
    tone: 'orange',
    icon: Warning,
    value: (k) => formatPercent(k?.refundRate),
    delta: (k) => deltaMeta(k?.compare?.refundRate, true)
  },
  {
    key: 'commission',
    label: '平台佣金收入',
    tone: 'sky',
    icon: Money,
    value: (k) => formatGmv(k?.platformCommission ?? 0),
    delta: () => ({ text: '暂无环比', tone: 'flat' as const })
  }
];
</script>

<template>
  <div class="proto-kpi-row">
    <article
      v-for="card in cards"
      :key="card.key"
      class="proto-kpi-card"
      :class="`tone-${card.tone}`"
    >
      <div class="proto-kpi-main">
        <div class="proto-kpi-copy">
          <span class="proto-kpi-label">{{ card.label }}</span>
          <strong class="proto-kpi-value">{{ card.value(kpi) }}</strong>
          <small v-if="card.delta" class="proto-kpi-delta" :class="`is-${card.delta(kpi).tone}`">
            {{ card.delta(kpi).text }}
          </small>
          <ul v-if="card.breakdown && card.breakdown(kpi).length" class="proto-kpi-breakdown">
            <li v-for="row in card.breakdown(kpi)" :key="row.label" class="proto-kpi-breakdown-row">
              <span class="proto-kpi-breakdown-swatch" :style="{ background: row.color }" />
              <span class="proto-kpi-breakdown-label">{{ row.label }}</span>
              <span class="proto-kpi-breakdown-value">¥ {{ formatNumber(row.value) }}</span>
            </li>
          </ul>
        </div>
        <div class="proto-kpi-icon">
          <el-icon><component :is="card.icon" /></el-icon>
        </div>
      </div>
    </article>
  </div>
</template>

<style src="../../../styles/components/gmv-proto-kpi.css" scoped></style>
