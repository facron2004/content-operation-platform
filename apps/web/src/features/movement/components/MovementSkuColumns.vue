<script setup lang="ts">
import { STALE_BUCKET_LABELS, type StaleBucket } from '../composables/useMovementList';
import type { MovementSkuRow } from '../../../services/api/movement.api';
import { displayMoney } from '../../../utils/format';

function salesProgress(row: MovementSkuRow): number {
  const available = Math.max(1, row.stockLeft + row.recent30dSalesQty);
  return Math.min(100, Math.round((row.recent30dSalesQty / available) * 100));
}
</script>
<template>
  <el-table-column prop="packageName" label="套餐" min-width="180" show-overflow-tooltip />
  <el-table-column prop="merchantName" label="商家" min-width="180" show-overflow-tooltip />
  <el-table-column prop="areaName" label="区域" min-width="100">
    <template #default="{ row }">{{ row.areaName || '—' }}</template>
  </el-table-column>
  <el-table-column prop="category" label="品类" width="100" />
  <el-table-column label="售价" width="90" align="right">
    <template #default="{ row }">{{ displayMoney(row, 'salePrice') }}</template>
  </el-table-column>
  <el-table-column label="库存" width="90" align="right">
    <template #default="{ row }">
      <span class="cell-primary">{{ row.stockLeft }} / {{ row.stockTotal }}</span>
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
  <el-table-column label="阶梯" width="108" align="center">
    <template #default="{ row }">
      <span class="mv-bucket-chip" :class="`is-${row.staleBucket as StaleBucket}`">
        {{ STALE_BUCKET_LABELS[row.staleBucket as StaleBucket] }}
      </span>
    </template>
  </el-table-column>
  <el-table-column label="30 天销量" width="150" align="right">
    <template #default="{ row }">
      <div class="mv-sales-cell">
        <div>
          <strong>{{ row.recent30dSalesQty }}</strong>
          <span>{{ displayMoney(row, 'recent30dSalesAmount') }}</span>
        </div>
        <el-progress
          :percentage="salesProgress(row)"
          :stroke-width="5"
          :show-text="false"
          color="#007aff"
        />
      </div>
    </template>
  </el-table-column>
</template>

<style scoped>
.mv-bucket-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  padding: 3px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}

.mv-bucket-chip.is-stale_60d {
  color: #fff;
  background: #a51d2a;
}

.mv-bucket-chip.is-stale_30d {
  color: #fff;
  background: #ff3b30;
}

.mv-bucket-chip.is-stale_15d {
  color: #7a3b00;
  background: #fff0dc;
}

.mv-bucket-chip.is-stale_7d {
  color: #6b5200;
  background: #fff7bf;
}

.mv-bucket-chip.is-normal {
  color: #08783d;
  background: #e9f8ef;
}

.mv-sales-cell {
  display: grid;
  grid-template-columns: auto 56px;
  align-items: center;
  justify-content: end;
  gap: 8px;
}

.mv-sales-cell > div {
  display: grid;
  justify-items: end;
  line-height: 1.15;
}

.mv-sales-cell strong {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.mv-sales-cell span {
  margin-top: 2px;
  color: var(--muted);
  font-size: 10px;
}

.mv-sales-cell :deep(.el-progress) {
  width: 56px;
}
</style>
