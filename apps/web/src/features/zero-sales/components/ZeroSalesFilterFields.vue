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
  <!-- Residual #216: merchantId filter (state+API+export already applied; UI was drill-only). -->
  <el-form-item label="商家">
    <el-input
      :model-value="filters.merchantId"
      placeholder="merchantId"
      clearable
      style="width: 140px"
      @update:model-value="emit('update:merchantId', String($event ?? ''))"
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
  <!-- Residual #217: SKU sort (API ZeroSalesSkusQueryDto.sort existed unwired). -->
  <el-form-item v-if="activeTab === 'sku'" label="排序">
    <el-select
      :model-value="filters.sort || 'lastSalesDateAsc'"
      style="width: 160px"
      @update:model-value="emit('update:sort', String($event ?? 'lastSalesDateAsc'))"
      @change="emit('filter-change')"
    >
      <el-option label="上次销售日(最早)" value="lastSalesDateAsc" />
      <el-option label="距今天数(降序)" value="staleDesc" />
      <el-option label="30 天 GMV(降序)" value="gmvDesc" />
    </el-select>
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
    <AppleButton size="sm" variant="secondary" @click="emit('export')">
      <template #icon>
        <el-icon><Download /></el-icon>
      </template>
      导出 CSV
    </AppleButton>
  </el-form-item>
</template>
<script setup lang="ts">
import { Download } from '@element-plus/icons-vue';
import AppleButton from '../../../components/AppleButton.vue';
defineProps<{
  activeTab: string;
  filters: {
    areaId?: string;
    category?: string;
    search?: string;
    merchantId?: string;
    sort?: string;
  };
}>();
const emit = defineEmits<{
  (e: 'update:areaId', value: string): void;
  (e: 'update:merchantId', value: string): void;
  (e: 'update:category', value: string): void;
  (e: 'update:sort', value: string): void;
  (e: 'update:search', value: string): void;
  (e: 'filter-change'): void;
  (e: 'export'): void;
}>();
</script>
