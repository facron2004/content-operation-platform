<script setup lang="ts">
import type { DataAnalysisRankRow } from '../../../services/api/data-analysis.api';
import { displayMoney, formatNumber, formatPercent, rateClassInv } from '../../../utils/format';

defineProps<{
  title: string;
  nameLabel: string;
  rows: DataAnalysisRankRow[];
  emptyHint?: string;
  /** Residual #279: interactive ranking cap honesty. */
  capLimit?: number;
  capTruncated?: boolean;
}>();
</script>

<template>
  <section class="panel top-offenders">
    <header>
      <h3>{{ title }}</h3>
      <span class="panel-hint">
        按销售额降序 · Top {{ capLimit && capTruncated ? capLimit : rows.length || '—'
        }}{{ capTruncated ? '（预览上限）' : '' }}
      </span>
    </header>
    <el-table :data="rows" size="small" empty-text="暂无数据" max-height="420">
      <el-table-column prop="rank" label="#" width="48" align="center" />
      <el-table-column prop="name" :label="nameLabel" min-width="140" show-overflow-tooltip />
      <el-table-column label="支付订单数" min-width="100" align="right">
        <template #default="{ row }">{{ formatNumber(row.orderCount, 0) }}</template>
      </el-table-column>
      <el-table-column label="销售额" min-width="110" align="right">
        <template #default="{ row }">{{ displayMoney(row, 'salesAmount') }}</template>
      </el-table-column>
      <el-table-column label="余额抵扣" min-width="100" align="right">
        <template #default="{ row }">{{ displayMoney(row, 'walletAmount') }}</template>
      </el-table-column>
      <el-table-column label="退款" min-width="90" align="right">
        <template #default="{ row }">{{ displayMoney(row, 'refundAmount') }}</template>
      </el-table-column>
      <el-table-column label="核销率" min-width="90" align="right">
        <template #default="{ row }">
          <span :class="rateClassInv(row.verifyRate, 0.6, 0.3)">
            {{ formatPercent(row.verifyRate) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="净客单价" min-width="100" align="right">
        <template #default="{ row }">{{ displayMoney(row, 'avgOrderValue') }}</template>
      </el-table-column>
    </el-table>
    <p v-if="!rows.length && emptyHint" class="empty-hint">{{ emptyHint }}</p>
  </section>
</template>
