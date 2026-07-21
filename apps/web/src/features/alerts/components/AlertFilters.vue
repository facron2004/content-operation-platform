<template>
  <div class="filter-bar alert-filter">
    <el-input
      :model-value="filters.keyword"
      clearable
      placeholder="搜索套餐 / 商家 / 区域"
      @update:model-value="$emit('update:keyword', $event)"
    />
    <AlertFilterSelects
      :level="filters.level"
      :type="filters.type"
      @update:level="$emit('update:level', $event)"
      @update:type="$emit('update:type', $event)"
    />
    <el-button @click="$emit('clear')">清空筛选</el-button>
  </div>
</template>
<script setup lang="ts">
import AlertFilterSelects from './AlertFilterSelects.vue';
defineProps<{ filters: { keyword: string; level: string; type: string } }>();
defineEmits<{
  'update:keyword': [value: string];
  'update:level': [value: string];
  'update:type': [value: string];
  clear: [];
}>();
</script>
<style src="../../../styles/components/alert-filters.css" scoped></style>
