<template>
  <section class="panel">
    <header><h4>同区域同品类竞品</h4></header>
    <el-table :data="competitors" size="small" max-height="240" empty-text="暂无竞品数据">
      <el-table-column prop="merchantName" label="竞品商家" min-width="160" />
      <el-table-column prop="category" label="品类" width="100" />
      <el-table-column label="SKU 数" width="90" align="right" prop="skuCount" />
      <el-table-column label="均价" width="100" align="right">
        <template #default="{ row }">
          ¥ {{ row.skuCount > 0 ? (row.totalPrice / row.skuCount).toFixed(2) : '—' }}
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>
<script setup lang="ts">
defineProps<{
  competitors: Array<{
    merchantName: string;
    category: string;
    skuCount: number;
    totalPrice: number;
  }>;
}>();
</script>
