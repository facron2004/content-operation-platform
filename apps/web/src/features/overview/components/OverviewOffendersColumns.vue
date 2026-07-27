<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
defineEmits<{ 'go-zero-sales': [merchantId?: string] }>();
function ratio(row: { stale30SkuCount: number; totalSku: number }) {
  return row.totalSku ? `${((row.stale30SkuCount / row.totalSku) * 100).toFixed(1)}%` : '—';
}
</script>
<template>
  <el-table-column prop="merchantName" label="商家" min-width="160" />
  <el-table-column prop="areaName" label="区域" min-width="100">
    <template #default="{ row }">{{ row.areaName || '—' }}</template>
  </el-table-column>
  <el-table-column prop="stale30SkuCount" label="零动销 SKU" width="120" align="right">
    <template #default="{ row }">
      <el-tag size="small" type="danger" effect="plain">{{ row.stale30SkuCount }}</el-tag>
    </template>
  </el-table-column>
  <el-table-column prop="totalSku" label="总 SKU" width="100" align="right" />
  <el-table-column label="零动销占比" width="110" align="right">
    <template #default="{ row }">{{ ratio(row) }}</template>
  </el-table-column>
  <el-table-column label="操作" width="120" align="right" fixed="right">
    <template #default="{ row }">
      <AppleButton variant="ghost" size="sm" @click="$emit('go-zero-sales', row.merchantId)">
        下钻
      </AppleButton>
    </template>
  </el-table-column>
</template>
