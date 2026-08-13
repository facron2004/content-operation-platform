<template>
  <div class="proto-kpi-row">
    <article
      v-for="card in cards"
      :key="card.key"
      class="proto-kpi-card"
      :class="`tone-${card.tone}`"
    >
      <div class="proto-kpi-header">
        <span class="proto-kpi-label">{{ card.label }}</span>
        <div class="proto-kpi-icon">
          <el-icon><component :is="card.icon" /></el-icon>
        </div>
      </div>
      <div class="proto-kpi-value-row">
        <strong class="proto-kpi-value">{{ card.value(kpi) }}</strong>
      </div>
      <small v-if="card.delta" class="proto-kpi-delta" :class="`is-${card.delta(kpi).tone}`">
        {{ card.delta(kpi).text }}
      </small>
      <div v-if="card.breakdown" class="proto-kpi-breakdown">
        <span v-for="row in card.breakdown(kpi)" :key="row.label" class="breakdown-item">
          <em>{{ row.label }}</em>
          <strong>{{ row.display }}</strong>
        </span>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { GmvKpi } from '../../../services/api/gmv.api';
import { Coin, Calendar, Document, Wallet, CircleCheck, Warning } from '@element-plus/icons-vue';
import { displayMoney, formatCount, formatPercent, readFen } from '../../../utils/format';
import { formatFenYuan } from '../../../utils/money';

defineProps<{
  kpi: GmvKpi | null;
}>();

type Tone = 'blue' | 'cyan' | 'indigo' | 'purple' | 'green' | 'orange';

type BreakdownRow = { label: string; display: string };

function buildGmvBreakdown(
  totalFen: bigint | null,
  onlineFen: bigint | null,
  walletFen: bigint | null
): BreakdownRow[] {
  if (!totalFen || totalFen <= 0n) return [];
  return [
    { label: '余额金额', display: formatFenYuan(walletFen) },
    { label: '现金支付金额', display: formatFenYuan(onlineFen) }
  ];
}

function readCompareDelta(kpi: GmvKpi | null, field: string): number | null | undefined {
  if (!kpi || !kpi.compare) return null;
  const comp = kpi.compare as Record<string, unknown>;
  const val = comp[`${field}Fen`] ?? comp[field];
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
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
    text: `较昨日 ${up ? '\u2191' : '\u2193'} ${pct}%`,
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
    label: '经营日净 GMV',
    tone: 'blue',
    icon: Coin,
    value: (k) => displayMoney(k, 'totalGmv'),
    delta: (k) => deltaMeta(readCompareDelta(k, 'totalGmv')),
    breakdown: (k) =>
      buildGmvBreakdown(readFen(k, 'totalGmv'), readFen(k, 'gmvOnline'), readFen(k, 'gmvWallet'))
  },
  {
    key: 'month',
    label: '本月净 GMV',
    tone: 'cyan',
    icon: Calendar,
    value: (k) => displayMoney(k, 'monthGmv'),
    delta: (k) => deltaMeta(readCompareDelta(k, 'monthGmv')),
    breakdown: (k) =>
      buildGmvBreakdown(
        readFen(k, 'monthGmv'),
        readFen(k, 'monthGmvOnline'),
        readFen(k, 'monthGmvWallet')
      )
  },
  {
    key: 'orders',
    label: '支付订单数',
    tone: 'indigo',
    icon: Document,
    value: (k) => formatCount(k?.paidOrderCount),
    delta: (k) => deltaMeta(readCompareDelta(k, 'paidOrderCount'))
  },
  {
    key: 'aov',
    label: '净客单价',
    tone: 'purple',
    icon: Wallet,
    value: (k) => displayMoney(k, 'avgOrderValue'),
    delta: (k) => deltaMeta(readCompareDelta(k, 'avgOrderValue'))
  },
  {
    key: 'verify',
    label: '核销率',
    tone: 'green',
    icon: CircleCheck,
    value: (k) => formatPercent(k?.verifyRate),
    delta: (k) => deltaMeta(readCompareDelta(k, 'verifyRate'))
  },
  {
    key: 'refund',
    label: '退款率',
    tone: 'orange',
    icon: Warning,
    value: (k) => formatPercent(k?.refundRate),
    delta: (k) => deltaMeta(readCompareDelta(k, 'refundRate'), true),
    breakdown: (k) => {
      if (!k) return [];
      const amountFen = readFen(k, 'totalRefund');
      const count = k.refundOrderCount ?? 0;
      if ((!amountFen || amountFen <= 0n) && count <= 0) return [];
      return [
        { label: '退款金额', display: formatFenYuan(amountFen) },
        { label: '退款单数', display: formatCount(count) }
      ];
    }
  }
];
</script>

<style src="../../../styles/components/gmv-proto-kpi.css" scoped></style>

<style scoped src="../../../styles/components/gmv-kpi-row.css"></style>
