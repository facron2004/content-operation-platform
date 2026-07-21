<template>
  <el-table :data="topMerchants" size="small" empty-text="暂无数据">
    <el-table-column prop="merchantName" label="商家" min-width="200" show-overflow-tooltip />
    <el-table-column prop="areaName" label="区域" min-width="90">
      <template #default="{ row }">{{ row.areaName || '—' }}</template>
    </el-table-column>
    <el-table-column prop="gmv" label="GMV" min-width="110" align="right">
      <template #default="{ row }">¥ {{ formatNumber(row.gmv) }}</template>
    </el-table-column>
    <el-table-column prop="gmvRefund" label="退款金额" min-width="100" align="right">
      <template #default="{ row }">¥ {{ formatNumber(row.gmvRefund) }}</template>
    </el-table-column>
    <el-table-column label="退款率" min-width="80" align="right">
      <template #default="{ row }">{{ formatPercent(row.refundRate) }}</template>
    </el-table-column>
    <el-table-column prop="gmvVerify" label="核销金额" min-width="100" align="right">
      <template #default="{ row }">¥ {{ formatNumber(row.gmvVerify) }}</template>
    </el-table-column>
    <el-table-column label="核销率" min-width="80" align="right">
      <template #default="{ row }">{{ formatPercent(row.verifyRate) }}</template>
    </el-table-column>
    <el-table-column prop="paidOrderCount" label="成单数" min-width="80" align="right" />
  </el-table>
</template>
<script setup lang="ts">
import { formatNumber, formatPercent } from '../../../utils/format';
defineProps<{
  topMerchants: Array<{
    merchantName: string;
    areaName?: string | null;
    gmv: number;
    gmvRefund: number;
    gmvVerify: number;
    refundRate: number;
    verifyRate: number;
    paidOrderCount: number;
  }>;
}>();
</script>
