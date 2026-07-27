<script setup lang="ts">
import type { DataAnalysisRefundRow } from '../../../services/api/data-analysis.api';
import { formatGmv, formatNumber, formatPercent, rateClassInv } from '../../../utils/format';

defineProps<{
  merchantRefunds: DataAnalysisRefundRow[];
  salesmanRefunds: DataAnalysisRefundRow[];
  /** Residual #279: interactive refund panel cap honesty. */
  capLimit?: number;
  capTruncated?: boolean;
}>();
</script>

<template>
  <div class="da-refund-row">
    <section class="panel top-offenders">
      <header>
        <h3>商家退款</h3>
        <span class="panel-hint">
          按退款金额 · Top
          {{ capLimit && capTruncated ? capLimit : merchantRefunds.length || '—'
          }}{{ capTruncated ? '（预览上限）' : '' }}
        </span>
      </header>
      <el-table :data="merchantRefunds" size="small" empty-text="暂无退款" max-height="320">
        <el-table-column prop="name" label="商家" min-width="160" show-overflow-tooltip />
        <el-table-column label="退款笔数" min-width="90" align="right">
          <template #default="{ row }">{{ formatNumber(row.orderCount, 0) }}</template>
        </el-table-column>
        <el-table-column label="退款金额" min-width="110" align="right">
          <template #default="{ row }">{{ formatGmv(row.refundAmount) }}</template>
        </el-table-column>
        <el-table-column label="核销率" min-width="90" align="right">
          <template #default="{ row }">
            <span :class="rateClassInv(row.verifyRate, 0.6, 0.3)">
              {{ formatPercent(row.verifyRate) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel top-offenders">
      <header>
        <h3>业务员退款</h3>
        <span class="panel-hint">
          按退款金额 · Top
          {{ capLimit && capTruncated ? capLimit : salesmanRefunds.length || '—'
          }}{{ capTruncated ? '（预览上限）' : '' }}
        </span>
      </header>
      <el-table :data="salesmanRefunds" size="small" empty-text="暂无退款" max-height="320">
        <el-table-column prop="name" label="业务员" min-width="120" show-overflow-tooltip />
        <el-table-column label="退款笔数" min-width="90" align="right">
          <template #default="{ row }">{{ formatNumber(row.orderCount, 0) }}</template>
        </el-table-column>
        <el-table-column label="退款金额" min-width="110" align="right">
          <template #default="{ row }">{{ formatGmv(row.refundAmount) }}</template>
        </el-table-column>
        <el-table-column label="核销率" min-width="90" align="right">
          <template #default="{ row }">
            <span :class="rateClassInv(row.verifyRate, 0.6, 0.3)">
              {{ formatPercent(row.verifyRate) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>
