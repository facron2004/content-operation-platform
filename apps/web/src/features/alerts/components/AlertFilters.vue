<template>
  <div class="filter-bar alert-filter">
    <el-input
      :model-value="filters.keyword"
      clearable
      placeholder="搜索套餐 / 商家 / 区域"
      @update:model-value="$emit('update:keyword', $event)"
    />
    <el-select
      :model-value="filters.level"
      clearable
      placeholder="预警等级"
      @update:model-value="$emit('update:level', $event)"
    >
      <el-option label="高危" value="danger" />
      <el-option label="警告" value="warning" />
      <el-option label="提醒" value="info" />
    </el-select>
    <el-select
      :model-value="filters.type"
      clearable
      filterable
      placeholder="预警类型"
      @update:model-value="$emit('update:type', $event)"
    >
      <el-option
        v-for="(label, value) in alertTypeLabels"
        :key="value"
        :label="label"
        :value="value"
      />
    </el-select>
    <el-button @click="$emit('clear')">清空筛选</el-button>
  </div>
</template>

<script setup lang="ts">
import { alertTypeLabels } from '../../../utils/labels';

defineProps<{
  filters: {
    keyword: string;
    level: string;
    type: string;
  };
}>();

defineEmits<{
  'update:keyword': [value: string];
  'update:level': [value: string];
  'update:type': [value: string];
  clear: [];
}>();
</script>

<style scoped>
.alert-filter {
  padding: 0;
}

.alert-filter .el-input {
  width: 200px;
}

@media (max-width: 960px) {
  .alert-filter .el-input,
  .alert-filter .el-select {
    width: 100%;
  }
}
</style>
