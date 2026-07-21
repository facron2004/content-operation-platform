<template>
  <el-select
    :model-value="level"
    clearable
    placeholder="预警等级"
    @update:model-value="$emit('update:level', $event)"
  >
    <el-option label="高危" value="danger" />
    <el-option label="警告" value="warning" />
    <el-option label="提醒" value="info" />
  </el-select>
  <el-select
    :model-value="type"
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
</template>
<script setup lang="ts">
import { alertTypeLabels } from '../../../utils/labels';
defineProps<{ level: string; type: string }>();
defineEmits<{ 'update:level': [value: string]; 'update:type': [value: string] }>();
</script>
