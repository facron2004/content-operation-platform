<template>
  <el-radio-group :model-value="staleDim" size="small" @change="$emit('change', $event)">
    <el-radio-button value="stale">按阶梯</el-radio-button>
    <el-radio-button value="area">按区域</el-radio-button>
    <el-radio-button value="category">按品类</el-radio-button>
  </el-radio-group>
</template>
<script setup lang="ts">
defineProps<{ staleDim: string }>();
defineEmits<{ change: [value: string | number | boolean | undefined] }>();
</script>
