<script setup lang="ts">
import type { DataAnalysisRateRow } from '../../../services/api/data-analysis.api';
import { formatNumber, formatPercent, rateClassInv } from '../../../utils/format';

defineProps<{
  merchantLow: DataAnalysisRateRow[];
  merchantHigh: DataAnalysisRateRow[];
  salesmanLow: DataAnalysisRateRow[];
  salesmanHigh: DataAnalysisRateRow[];
}>();

function rateTone(rate: number) {
  return rateClassInv(rate, 0.6, 0.3);
}
</script>

<template>
  <section class="panel da-verify">
    <header>
      <h3>核销率分析</h3>
      <span class="panel-hint">商家订单≥5 · 业务员订单≥10</span>
    </header>
    <div class="verify-grid">
      <div class="verify-block">
        <h4>商家 · 核销率最低</h4>
        <el-table :data="merchantLow" size="small" empty-text="—" max-height="220">
          <el-table-column prop="name" label="商家" min-width="140" show-overflow-tooltip />
          <el-table-column label="订单" width="70" align="right">
            <template #default="{ row }">{{ formatNumber(row.orderCount, 0) }}</template>
          </el-table-column>
          <el-table-column label="核销率" width="90" align="right">
            <template #default="{ row }">
              <span :class="rateTone(row.verifyRate)">{{ formatPercent(row.verifyRate) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="verify-block">
        <h4>商家 · 核销率最高</h4>
        <el-table :data="merchantHigh" size="small" empty-text="—" max-height="220">
          <el-table-column prop="name" label="商家" min-width="140" show-overflow-tooltip />
          <el-table-column label="订单" width="70" align="right">
            <template #default="{ row }">{{ formatNumber(row.orderCount, 0) }}</template>
          </el-table-column>
          <el-table-column label="核销率" width="90" align="right">
            <template #default="{ row }">
              <span :class="rateTone(row.verifyRate)">{{ formatPercent(row.verifyRate) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="verify-block">
        <h4>业务员 · 核销率最低</h4>
        <el-table :data="salesmanLow" size="small" empty-text="—" max-height="220">
          <el-table-column prop="name" label="业务员" min-width="120" show-overflow-tooltip />
          <el-table-column label="订单" width="70" align="right">
            <template #default="{ row }">{{ formatNumber(row.orderCount, 0) }}</template>
          </el-table-column>
          <el-table-column label="核销率" width="90" align="right">
            <template #default="{ row }">
              <span :class="rateTone(row.verifyRate)">{{ formatPercent(row.verifyRate) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="verify-block">
        <h4>业务员 · 核销率最高</h4>
        <el-table :data="salesmanHigh" size="small" empty-text="—" max-height="220">
          <el-table-column prop="name" label="业务员" min-width="120" show-overflow-tooltip />
          <el-table-column label="订单" width="70" align="right">
            <template #default="{ row }">{{ formatNumber(row.orderCount, 0) }}</template>
          </el-table-column>
          <el-table-column label="核销率" width="90" align="right">
            <template #default="{ row }">
              <span :class="rateTone(row.verifyRate)">{{ formatPercent(row.verifyRate) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </section>
</template>
