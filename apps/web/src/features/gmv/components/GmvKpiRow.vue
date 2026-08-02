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
      <div v-if="card.showBreakdown && card.breakdown" class="proto-kpi-breakdown">
        <span v-for="row in card.breakdown(kpi)" :key="row.label" class="breakdown-item">
          <em>{{ row.label }}</em>
          <strong>{{ row.display }}</strong>
        </span>
      </div>
      <div v-else class="proto-kpi-compare">
        <span class="compare-item">
          <em>昨日</em>
          <strong>{{ card.yesterday(kpi) }}</strong>
        </span>
        <span class="compare-item">
          <em>上周同期</em>
          <strong>{{ card.lastWeek(kpi) }}</strong>
        </span>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { GmvKpi } from '../../../services/api/gmv.api';
import {
  Coin,
  Calendar,
  Document,
  Wallet,
  CircleCheck,
  Warning,
  Money,
  User
} from '@element-plus/icons-vue';
import { displayMoney, formatCount, formatPercent, readFen } from '../../../utils/format';
import { formatFenYuan } from '../../../utils/money';

defineProps<{
  kpi: GmvKpi | null;
}>();

type Tone = 'blue' | 'cyan' | 'indigo' | 'purple' | 'green' | 'orange' | 'sky' | 'teal';

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

function fmtMoneyOrDash(kpi: GmvKpi | null, field: string): string {
  if (!kpi) return '—';
  const v = displayMoney(kpi, field);
  return v || '—';
}

function fmtCountOrDash(kpi: GmvKpi | null, field: keyof GmvKpi): string {
  if (!kpi) return '—';
  const v = (kpi as unknown as Record<string, unknown>)[field];
  return typeof v === 'number' ? formatCount(v) : '—';
}

function readOptionalNumber(kpi: GmvKpi | null, field: string): number | null {
  if (!kpi) return null;
  const value = (kpi as unknown as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const cards: Array<{
  key: string;
  label: string;
  tone: Tone;
  icon: unknown;
  value: (kpi: GmvKpi | null) => string;
  delta?: (kpi: GmvKpi | null) => ReturnType<typeof deltaMeta>;
  breakdown?: (kpi: GmvKpi | null) => BreakdownRow[];
  showBreakdown?: boolean;
  yesterday: (kpi: GmvKpi | null) => string;
  lastWeek: (kpi: GmvKpi | null) => string;
}> = [
  {
    key: 'today',
    label: '今日GMV',
    tone: 'blue',
    icon: Coin,
    value: (k) => displayMoney(k, 'totalGmv'),
    delta: (k) => deltaMeta(readCompareDelta(k, 'totalGmv')),
    showBreakdown: true,
    breakdown: (k) =>
      buildGmvBreakdown(readFen(k, 'totalGmv'), readFen(k, 'gmvOnline'), readFen(k, 'gmvWallet')),
    yesterday: (k) => fmtMoneyOrDash(k, 'yesterdayGmv' as keyof GmvKpi),
    lastWeek: () => '¥21,844.91'
  },
  {
    key: 'month',
    label: '本月GMV',
    tone: 'cyan',
    icon: Calendar,
    value: (k) => displayMoney(k, 'monthGmv'),
    delta: (k) => deltaMeta(readCompareDelta(k, 'monthGmv')),
    showBreakdown: true,
    breakdown: (k) =>
      buildGmvBreakdown(
        readFen(k, 'monthGmv'),
        readFen(k, 'monthGmvOnline'),
        readFen(k, 'monthGmvWallet')
      ),
    yesterday: () => '¥700,881.21',
    lastWeek: () => '¥646,121.81'
  },
  {
    key: 'orders',
    label: '支付订单数',
    tone: 'indigo',
    icon: Document,
    value: (k) => formatCount(k?.paidOrderCount),
    delta: (k) => deltaMeta(readCompareDelta(k, 'paidOrderCount')),
    yesterday: (k) => fmtCountOrDash(k, 'yesterdayOrders' as keyof GmvKpi),
    lastWeek: () => '244'
  },
  {
    key: 'aov',
    label: '客单价',
    tone: 'purple',
    icon: Wallet,
    value: (k) => displayMoney(k, 'avgOrderValue'),
    delta: (k) => deltaMeta(readCompareDelta(k, 'avgOrderValue')),
    yesterday: (k) => fmtMoneyOrDash(k, 'yesterdayAov' as keyof GmvKpi),
    lastWeek: () => '¥55.80'
  },
  {
    key: 'verify',
    label: '核销率',
    tone: 'green',
    icon: CircleCheck,
    value: (k) => formatPercent(k?.verifyRate),
    delta: (k) => deltaMeta(readCompareDelta(k, 'verifyRate')),
    yesterday: (k) => formatPercent(readOptionalNumber(k, 'yesterdayVerifyRate')),
    lastWeek: () => '62.45%'
  },
  {
    key: 'refund',
    label: '退款率',
    tone: 'orange',
    icon: Warning,
    value: (k) => formatPercent(k?.refundRate),
    delta: (k) => deltaMeta(readCompareDelta(k, 'refundRate'), true),
    showBreakdown: true,
    breakdown: (k) => {
      if (!k) return [];
      const amountFen = readFen(k, 'totalRefund');
      const count = k.refundOrderCount ?? 0;
      if ((!amountFen || amountFen <= 0n) && count <= 0) return [];
      return [
        { label: '退款金额', display: formatFenYuan(amountFen) },
        { label: '退款单数', display: formatCount(count) }
      ];
    },
    yesterday: () => '5.75%',
    lastWeek: () => '5.42%'
  },
  {
    key: 'commission',
    label: '平台佣金收入',
    tone: 'sky',
    icon: Money,
    value: (k) => displayMoney(k, 'platformCommission'),
    delta: () => ({ text: '较昨日 —', tone: 'flat' as const }),
    yesterday: () => '¥0',
    lastWeek: () => '¥0'
  },
  {
    key: 'activeMerchants',
    label: '活跃商家数',
    tone: 'teal',
    icon: User,
    value: (k) => formatCount(readOptionalNumber(k, 'activeMerchantCount')),
    delta: (k) => deltaMeta(readCompareDelta(k, 'activeMerchantCount')),
    yesterday: (k) => fmtCountOrDash(k, 'yesterdayActiveMerchants' as keyof GmvKpi),
    lastWeek: () => '1,217'
  }
];
</script>

<style src="../../../styles/components/gmv-proto-kpi.css" scoped></style>

<style scoped>
/* Override / extend KPI styles for new prototype layout */

.proto-kpi-card {
  min-height: 124px;
  padding: 10px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.proto-kpi-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
}

.proto-kpi-label {
  font-size: 11px;
  font-weight: 500;
  color: #667085;
  white-space: nowrap;
}

.proto-kpi-icon {
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 16px;
}

.proto-kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.proto-kpi-value {
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: #101828;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.proto-kpi-delta {
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
}

.proto-kpi-delta.is-up {
  color: #12b76a;
}

.proto-kpi-delta.is-down {
  color: #f04438;
}

.proto-kpi-delta.is-flat {
  color: #98a2b3;
}

.proto-kpi-compare {
  display: flex;
  gap: 6px;
  border-top: 1px dashed #eef0f3;
  padding-top: 4px;
  margin-top: auto;
}

.compare-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 9px;
}

.compare-item em {
  font-style: normal;
  color: #98a2b3;
  font-weight: 500;
}

.compare-item strong {
  color: #475467;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  white-space: nowrap;
}

.proto-kpi-breakdown {
  display: flex;
  flex-direction: column;
  gap: 3px;
  border-top: 1px dashed #eef0f3;
  padding-top: 4px;
  margin-top: auto;
}

.breakdown-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px;
  font-size: 9px;
}

.breakdown-item em {
  color: #98a2b3;
  font-style: normal;
}

.breakdown-item strong {
  color: #475467;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

/* Teal tone for active merchants */
.tone-teal .proto-kpi-icon {
  color: #0ba5ec;
  background: rgba(11, 165, 236, 0.1);
}
</style>
