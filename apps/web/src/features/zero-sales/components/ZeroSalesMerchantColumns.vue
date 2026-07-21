<script setup lang="ts">
defineEmits<{ drill: [merchantId: string] }>();
</script>
<template>
  <el-table-column prop="merchantName" label="商家" min-width="160" />
  <el-table-column prop="areaName" label="区域" min-width="120">
    <template #default="{ row }">{{ row.areaName || '—' }}</template>
  </el-table-column>
  <el-table-column prop="totalSku" label="总 SKU" width="90" align="right" />
  <el-table-column prop="staleSkuCount" label="零动销 SKU" width="120" align="right">
    <template #default="{ row }">
      <el-tag size="small" type="danger" effect="plain">{{ row.staleSkuCount }}</el-tag>
    </template>
  </el-table-column>
  <el-table-column prop="lastSalesDate" label="上次销售日" width="120" align="center">
    <template #default="{ row }">{{ row.lastSalesDate || '— 从未销售 —' }}</template>
  </el-table-column>
  <el-table-column prop="staleGmv30d" label="30 天 GMV" width="120" align="right">
    <template #default="{ row }">
      ¥ {{ row.staleGmv30d.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) }}
    </template>
  </el-table-column>
  <el-table-column label="操作" width="180" align="right" fixed="right">
    <template #default="{ row }">
      <el-button type="primary" size="small" text @click="$emit('drill', row.merchantId)">
        下钻 SKU
      </el-button>
    </template>
  </el-table-column>
</template>
