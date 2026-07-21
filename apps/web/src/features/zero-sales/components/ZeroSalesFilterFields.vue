<template>
  <el-form-item label="区域">
    <el-input
      :model-value="filters.areaId"
      placeholder="areaId"
      clearable
      style="width: 140px"
      @update:model-value="emit('update:areaId', String($event ?? ''))"
      @change="emit('filter-change')"
    />
  </el-form-item>
  <el-form-item v-if="activeTab === 'sku'" label="品类">
    <el-input
      :model-value="filters.category"
      placeholder="category"
      clearable
      style="width: 140px"
      @update:model-value="emit('update:category', String($event ?? ''))"
      @change="emit('filter-change')"
    />
  </el-form-item>
  <el-form-item label="搜索">
    <el-input
      :model-value="filters.search"
      placeholder="商家名 / 套餐名"
      clearable
      style="width: 220px"
      @update:model-value="emit('update:search', String($event ?? ''))"
      @keyup.enter="emit('filter-change')"
      @change="emit('filter-change')"
    />
  </el-form-item>
  <el-form-item v-if="activeTab === 'sku'" label=" ">
    <el-button size="small" :icon="Download" @click="emit('export')">导出 CSV</el-button>
  </el-form-item>
</template>
<script setup lang="ts">
import { Download } from '@element-plus/icons-vue';
defineProps<{
  activeTab: string;
  filters: { areaId?: string; category?: string; search?: string; merchantId?: string };
}>();
const emit = defineEmits<{
  (e: 'update:areaId', value: string): void;
  (e: 'update:category', value: string): void;
  (e: 'update:search', value: string): void;
  (e: 'filter-change'): void;
  (e: 'export'): void;
}>();
</script>
