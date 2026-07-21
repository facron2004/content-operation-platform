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
    <el-button type="primary" :loading="loading" @click="$emit('refresh')">
      {{ loading ? '加载中' : '刷新套餐' }}
    </el-button>
  </div>
</template>
<script setup lang="ts">
defineProps<{
  areaId?: string;
  category?: string;
  unsoldOnly: boolean;
  areaOptions: Array<{ label: string; value: string }>;
  categoryOptions: string[];
  loading: boolean;
}>();
defineEmits<{
  'update:areaId': [value: string | undefined];
  'update:category': [value: string | undefined];
  'update:unsoldOnly': [value: boolean];
  refresh: [];
}>();
</script>
