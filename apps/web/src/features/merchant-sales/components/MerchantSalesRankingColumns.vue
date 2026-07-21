<script setup lang="ts">
defineProps<{
  rateClass: (value: number, warn: number, danger: number) => string;
  rateClassInv: (value: number, warn: number, danger: number) => string;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
}>();
</script>
<template>
  <el-table-column prop="merchantName" label="商家" min-width="220" show-overflow-tooltip />
  <el-table-column prop="areaName" label="区域" min-width="100">
    <template #default="{ row }">{{ row.areaName || '—' }}</template>
  </el-table-column>
  <el-table-column prop="gmv" label="GMV" min-width="120" align="right">
    <template #default="{ row }">¥ {{ formatNumber(row.gmv) }}</template>
  </el-table-column>
  <el-table-column prop="gmvRefund" label="退款金额" min-width="120" align="right">
    <template #default="{ row }">¥ {{ formatNumber(row.gmvRefund) }}</template>
  </el-table-column>
  <el-table-column prop="gmvVerify" label="核销金额" min-width="120" align="right">
    <template #default="{ row }">¥ {{ formatNumber(row.gmvVerify) }}</template>
  </el-table-column>
  <el-table-column label="退款率" min-width="90" align="right">
    <template #default="{ row }">
      <span :class="rateClass(row.refundRate, 0.05, 0.1)">{{ formatPercent(row.refundRate) }}</span>
    </template>
  </el-table-column>
  <el-table-column label="核销率" min-width="90" align="right">
    <template #default="{ row }">
      <span :class="rateClassInv(row.verifyRate, 0.6, 0.3)">
        {{ formatPercent(row.verifyRate) }}
      </span>
    </template>
  </el-table-column>
  <el-table-column prop="paidOrderCount" label="成单数" min-width="80" align="right" />
  <el-table-column label="动销 SKU" min-width="90" align="right">
    <template #default="{ row }">{{ row.packageCount }}</template>
  </el-table-column>
</template>
