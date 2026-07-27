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
    <!-- Residual #221: as-of business day (AlertQueryDto.date existed unwired). -->
    <el-date-picker
      :model-value="filters.date || undefined"
      type="date"
      value-format="YYYY-MM-DD"
      placeholder="业务日(默认今天)"
      clearable
      style="width: 180px"
      @update:model-value="$emit('update:date', $event ? String($event) : '')"
    />
    <AppleButton variant="secondary" @click="$emit('clear')">清空筛选</AppleButton>
  </div>
</template>
<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
import AlertFilterSelects from './AlertFilterSelects.vue';
defineProps<{ filters: { keyword: string; level: string; type: string; date: string } }>();
defineEmits<{
  'update:keyword': [value: string];
  'update:level': [value: string];
  'update:type': [value: string];
  'update:date': [value: string];
  clear: [];
}>();
</script>
<style src="../../../styles/components/alert-filters.css" scoped></style>
