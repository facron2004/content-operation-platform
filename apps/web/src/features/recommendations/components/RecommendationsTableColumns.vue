<script setup lang="ts">
import type { RecommendPackageItem } from '@content/shared';
import { displayPrice } from '../../../utils/labels';
import RecommendationsTagColumns from './RecommendationsTagColumns.vue';
defineEmits<{
  analysis: [row: RecommendPackageItem];
  generate: [packageId: string];
  'create-task': [packageId: string];
}>();
</script>
<template>
  <el-table-column type="index" label="#" width="42" />
  <el-table-column prop="packageName" label="套餐名称" min-width="160" show-overflow-tooltip />
  <el-table-column prop="category" label="类型" width="78" show-overflow-tooltip />
  <el-table-column prop="merchantName" label="商家" min-width="120" show-overflow-tooltip />
  <el-table-column prop="areaName" label="区域" width="68" />
  <el-table-column label="售价" width="68">
    <template #default="{ row }">{{ displayPrice(row) }}</template>
  </el-table-column>
  <el-table-column prop="stockLeft" label="库存" width="60" sortable />
  <RecommendationsTagColumns />
  <el-table-column prop="inventoryBacklogDays" label="天数" width="56" sortable />
  <el-table-column label="操作" width="180" fixed="right">
    <template #default="{ row }">
      <el-button size="small" type="primary" @click="$emit('generate', row.packageId)">
        文案
      </el-button>
      <el-button size="small" @click="$emit('create-task', row.packageId)">任务</el-button>
      <el-button size="small" @click="$emit('analysis', row)">详情</el-button>
    </template>
  </el-table-column>
</template>
