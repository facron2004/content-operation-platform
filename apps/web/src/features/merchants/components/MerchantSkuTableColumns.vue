<template>
  <el-table-column prop="packageName" label="套餐" min-width="160" />
  <el-table-column prop="category" label="品类" width="100" />
  <el-table-column label="售价" width="90" align="right">
    <template #default="{ row }">¥ {{ row.salePrice.toFixed(2) }}</template>
  </el-table-column>
  <el-table-column label="库存" width="80" align="right" prop="stockLeft" />
  <el-table-column label="距上次销售" width="100" align="right">
    <template #default="{ row }">
      <span v-if="row.lastSalesDate">{{ row.daysSinceLastSale }} 天</span>
      <span v-else>—</span>
    </template>
  </el-table-column>
  <el-table-column label="阶梯" width="100" align="center">
    <template #default="{ row }">
      <el-tag
        size="small"
        effect="plain"
        :style="{
          background: staleColor(row.staleBucket),
          borderColor: staleColor(row.staleBucket)
        }"
      >
        {{ staleLabel(row.staleBucket) }}
      </el-tag>
    </template>
  </el-table-column>
  <el-table-column label="操作" width="120" align="right" fixed="right">
    <template #default="{ row }">
      <AppleButton variant="ghost" size="sm" @click="$emit('go-analysis', row.packageId)">
        分析
      </AppleButton>
    </template>
  </el-table-column>
</template>
<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
defineProps<{ staleColor: (bucket: string) => string; staleLabel: (bucket: string) => string }>();
defineEmits<{ (e: 'go-analysis', packageId: string): void }>();
</script>
