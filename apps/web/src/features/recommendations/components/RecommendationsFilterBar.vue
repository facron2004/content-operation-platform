<template>
  <div class="filter-bar">
    <el-select
      :model-value="areaId"
      clearable
      placeholder="区域"
      @update:model-value="$emit('update:areaId', $event)"
    >
      <el-option
        v-for="area in areaOptions"
        :key="area.value"
        :label="area.label"
        :value="area.value"
      />
    </el-select>
    <!-- Residual #220: merchantId filter (API RecommendationsQueryDto.merchantId existed unwired). -->
    <el-input
      :model-value="merchantId"
      clearable
      placeholder="商家 ID"
      style="width: 160px"
      @update:model-value="$emit('update:merchantId', String($event ?? ''))"
    />
    <el-select
      :model-value="category"
      clearable
      filterable
      placeholder="所属类型"
      @update:model-value="$emit('update:category', $event)"
    >
      <el-option v-for="item in categoryOptions" :key="item" :label="item" :value="item" />
    </el-select>
    <el-checkbox
      :model-value="unsoldOnly"
      @update:model-value="$emit('update:unsoldOnly', Boolean($event))"
    >
      只看未售罄链接
    </el-checkbox>
    <!-- Residual #222: inventoryMin/Max (API RecommendationsQueryDto already applied). -->
    <el-input
      :model-value="inventoryMin"
      clearable
      placeholder="库存 ≥"
      style="width: 100px"
      @update:model-value="$emit('update:inventoryMin', String($event ?? ''))"
    />
    <el-input
      :model-value="inventoryMax"
      clearable
      placeholder="库存 ≤"
      style="width: 100px"
      @update:model-value="$emit('update:inventoryMax', String($event ?? ''))"
    />
    <!-- Residual #225: as-of business day (RecommendationsQueryDto.date). -->
    <el-date-picker
      :model-value="date || undefined"
      type="date"
      value-format="YYYY-MM-DD"
      placeholder="业务日(默认今天)"
      clearable
      style="width: 180px"
      @update:model-value="$emit('update:date', $event ? String($event) : '')"
    />
    <AppleButton variant="primary" :loading="loading" @click="$emit('refresh')">
      {{ loading ? '加载中' : '重新加载套餐' }}
    </AppleButton>
  </div>
</template>
<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
defineProps<{
  areaId?: string;
  merchantId?: string;
  category?: string;
  unsoldOnly: boolean;
  inventoryMin?: string;
  inventoryMax?: string;
  date?: string;
  areaOptions: Array<{ label: string; value: string }>;
  categoryOptions: string[];
  loading: boolean;
}>();
defineEmits<{
  'update:areaId': [value: string | undefined];
  'update:merchantId': [value: string];
  'update:category': [value: string | undefined];
  'update:unsoldOnly': [value: boolean];
  'update:inventoryMin': [value: string];
  'update:inventoryMax': [value: string];
  'update:date': [value: string];
  refresh: [];
}>();
</script>
