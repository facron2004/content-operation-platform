<script setup lang="ts">
import {
  STALE_BUCKET_COLORS,
  STALE_BUCKET_LABELS,
  type StaleBucket
} from '../composables/useMovementList';
import { formatGmv, formatNumber } from '../../../utils/format';
</script>
<template>
  <el-table-column prop="packageName" label="套餐" min-width="180" show-overflow-tooltip />
  <el-table-column prop="merchantName" label="商家" min-width="180" show-overflow-tooltip />
  <el-table-column prop="areaName" label="区域" min-width="100">
    <template #default="{ row }">{{ row.areaName || '—' }}</template>
  </el-table-column>
  <el-table-column prop="category" label="品类" width="100" />
  <el-table-column label="售价" width="90" align="right">
    <template #default="{ row }">¥ {{ formatNumber(row.salePrice) }}</template>
  </el-table-column>
  <el-table-column label="库存" width="100" align="right">
    <template #default="{ row }">
      <span class="cell-primary">{{ row.stockLeft }}</span>
      <span class="cell-secondary">/ {{ row.stockTotal }}</span>
    </template>
  </el-table-column>
  <el-table-column label="上次销售日" width="110" align="center">
    <template #default="{ row }">{{ row.lastSalesDate || '—' }}</template>
  </el-table-column>
  <el-table-column label="距今天数" width="90" align="right">
    <template #default="{ row }">
      {{ row.daysSinceLastSale >= 9999 ? '—' : row.daysSinceLastSale + ' 天' }}
    </template>
  </el-table-column>
  <el-table-column label="阶梯" width="100" align="center">
    <template #default="{ row }">
      <el-tag
        size="small"
        effect="plain"
        :style="{
          background: STALE_BUCKET_COLORS[row.staleBucket as StaleBucket],
          borderColor: STALE_BUCKET_COLORS[row.staleBucket as StaleBucket]
        }"
      >
        {{ STALE_BUCKET_LABELS[row.staleBucket as StaleBucket] }}
      </el-tag>
    </template>
  </el-table-column>
  <el-table-column label="30 天销量" width="110" align="right">
    <template #default="{ row }">
      <span class="cell-primary">{{ row.recent30dSalesQty }}</span>
      <span class="cell-secondary">{{ formatGmv(row.recent30dSalesAmount) }}</span>
    </template>
  </el-table-column>
</template>
