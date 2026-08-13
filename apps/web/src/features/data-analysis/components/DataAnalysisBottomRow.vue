<script setup lang="ts">
import { computed } from 'vue';
import type {
  DataAnalysisDeltas,
  DataAnalysisPackageRankRow,
  DataAnalysisWindowSnapshot
} from '../../../services/api/data-analysis.api';
import { displayMoney, formatNumber, formatPercent } from '../../../utils/format';
import { formatDelta } from '../composables/useDataAnalysisPage';

const props = defineProps<{
  snapshots: DataAnalysisWindowSnapshot[];
  deltas: DataAnalysisDeltas | null;
  packages: DataAnalysisPackageRankRow[];
  /** Residual #279: interactive package TOP-N cap honesty. */
  packageLimit?: number;
  packageTruncated?: boolean;
}>();

type MetricKey =
  | 'salesAmount'
  | 'netGmv'
  | 'writeOffAmount'
  | 'orderCount'
  | 'avgOrderValue'
  | 'verifyRate'
  | 'refundRate'
  | 'settlementRate'
  | 'refundAmount';

const metricDefs: Array<{
  key: MetricKey;
  label: string;
  kind: 'money' | 'count' | 'rate';
  deltaKey: keyof DataAnalysisDeltas;
}> = [
  { key: 'salesAmount', label: '总销售额（实付）', kind: 'money', deltaKey: 'salesAmount' },
  { key: 'netGmv', label: '净 GMV', kind: 'money', deltaKey: 'netGmv' },
  { key: 'writeOffAmount', label: '核销额', kind: 'money', deltaKey: 'writeOffAmount' },
  { key: 'orderCount', label: '支付订单数', kind: 'count', deltaKey: 'orderCount' },
  { key: 'avgOrderValue', label: '净客单价', kind: 'money', deltaKey: 'avgOrderValue' },
  { key: 'verifyRate', label: '核销率', kind: 'rate', deltaKey: 'verifyRate' },
  { key: 'refundRate', label: '退款率', kind: 'rate', deltaKey: 'refundRate' },
  { key: 'settlementRate', label: '整体结算率', kind: 'rate', deltaKey: 'settlementRate' },
  { key: 'refundAmount', label: '退款金额', kind: 'money', deltaKey: 'refundAmount' }
];

const cols = computed(() => {
  const order: Array<'today' | 'yesterday' | 'last7' | 'last30'> = [
    'today',
    'yesterday',
    'last7',
    'last30'
  ];
  const byKey = new Map(props.snapshots.map((s) => [s.key, s]));
  return order.map((k) => byKey.get(k)).filter(Boolean) as DataAnalysisWindowSnapshot[];
});

function cell(snap: DataAnalysisWindowSnapshot | undefined, key: MetricKey, kind: string) {
  if (!snap) return '—';
  const v = snap.overview[key] as number | undefined;
  if (kind === 'money') return displayMoney(snap.overview, key);
  if (kind === 'rate') return formatPercent(v);
  return formatNumber(v, 0);
}

function deltaCell(deltaKey: keyof DataAnalysisDeltas) {
  return formatDelta(props.deltas?.[deltaKey] ?? null);
}

const medal = ['1', '2', '3', '4', '5'];

/** Never show raw snowflake packageIds in the TOP 5 list. */
function displayPackageName(row: DataAnalysisPackageRankRow): string {
  const name = (row.packageName ?? '').trim();
  const id = (row.packageId ?? '').trim();
  if (name && name !== id && !/^\d{12,}$/.test(name)) return name;
  return '（套餐未同步）';
}
</script>

<template>
  <div class="da-bottom-row">
    <section class="panel da-matrix">
      <header>
        <h3>指标明细</h3>
      </header>
      <el-table :data="metricDefs" size="small" empty-text="暂无数据" class="da-matrix-table">
        <el-table-column prop="label" label="指标" min-width="140" fixed />
        <el-table-column
          v-for="snap in cols"
          :key="snap.key"
          :label="snap.label"
          min-width="110"
          align="right"
        >
          <template #default="{ row }">
            {{ cell(snap, row.key, row.kind) }}
          </template>
        </el-table-column>
        <el-table-column label="较上周期" min-width="110" align="right">
          <template #default="{ row }">
            <span class="da-matrix-delta" :class="`is-${deltaCell(row.deltaKey).tone}`">
              {{ deltaCell(row.deltaKey).text }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel da-packages">
      <header>
        <h3>
          热门商品 TOP {{ packageLimit && packageTruncated ? packageLimit : packages.length || 5 }}
        </h3>
        <span class="panel-hint">按销售额{{ packageTruncated ? ' · 预览上限' : '' }}</span>
      </header>
      <el-table :data="packages" size="small" empty-text="暂无商品数据" :show-header="true">
        <el-table-column label="排名" width="64" align="center">
          <template #default="{ row }">
            <span class="da-rank-badge" :class="`rank-${row.rank}`">
              {{ medal[row.rank - 1] ?? row.rank }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="商品名称" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ displayPackageName(row) }}</template>
        </el-table-column>
        <el-table-column label="销售额" min-width="110" align="right">
          <template #default="{ row }">{{ displayMoney(row, 'salesAmount') }}</template>
        </el-table-column>
        <el-table-column label="支付订单数" min-width="100" align="right">
          <template #default="{ row }">{{ formatNumber(row.orderCount, 0) }}</template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>
