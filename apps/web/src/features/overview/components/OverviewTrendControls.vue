<template>
  <el-radio-group :model-value="trendDays" size="small" @change="$emit('change', $event)">
    <el-radio-button :value="7">7 日</el-radio-button>
    <el-radio-button :value="30">30 日</el-radio-button>
  </el-radio-group>
</template>
<script setup lang="ts">
defineProps<{ trendDays: 7 | 30 }>();
defineEmits<{ change: [value: string | number | boolean | undefined] }>();
</script>
