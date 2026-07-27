<script setup lang="ts">
import {
  STALE_BUCKET_COLORS,
  STALE_BUCKET_LABELS,
  type StaleBucket
} from '../composables/useZeroSales';
import { displayMoney, formatNumber } from '../../../utils/format';
</script>
<template>
  <el-table-column prop="packageName" label="套餐" min-width="180" show-overflow-tooltip />
  <el-table-column prop="merchantName" label="商家" min-width="140" show-overflow-tooltip />
  <el-table-column prop="areaName" label="区域" min-width="100">
    <template #default="{ row }">{{ row.areaName || '—' }}</template>
  </el-table-column>
  <el-table-column prop="category" label="品类" width="90" />
  <el-table-column prop="salePrice" label="售价" width="90" align="right">
    <template #default="{ row }">{{ displayMoney(row, 'salePrice') }}</template>
  </el-table-column>
  <el-table-column label="库存" width="100" align="right">
    <template #default="{ row }">
      <span class="cell-primary">{{ row.stockLeft }}</span>
      <span class="cell-secondary">/ {{ row.stockTotal }}</span>
    </template>
  </el-table-column>
  <el-table-column label="30d 损失 GMV" width="120" align="right">
    <template #default="{ row }">{{ displayMoney(row, 'staleGmv30d') }}</template>
  </el-table-column>
  <el-table-column label="30d 销量" width="90" align="right">
    <template #default="{ row }">{{ formatNumber(row.staleSalesQty30d, 0) }}</template>
  </el-table-column>
  <el-table-column prop="lastSalesDate" label="上次销售日" width="120" align="center">
    <template #default="{ row }">{{ row.lastSalesDate || '从未销售' }}</template>
  </el-table-column>
  <el-table-column prop="daysSinceLastSale" label="距今天数" width="100" align="right" />
  <el-table-column label="阶梯" width="100" align="center">
    <template #default="{ row }">
      <el-tag
        size="small"
        effect="plain"
        :style="{
          background: STALE_BUCKET_COLORS[row.staleBucket as StaleBucket],
          color: '#1f2937',
          borderColor: STALE_BUCKET_COLORS[row.staleBucket as StaleBucket]
        }"
      >
        {{ STALE_BUCKET_LABELS[row.staleBucket as StaleBucket] }}
      </el-tag>
    </template>
  </el-table-column>
</template>
