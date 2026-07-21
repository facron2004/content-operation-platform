<script setup lang="ts">
const model = defineModel<1 | 7 | 30>({ required: true });
defineEmits<{ change: [] }>();
</script>
<template>
  <el-select v-model="model" size="small" style="width: 110px" @change="$emit('change')">
    <el-option label="1 日" :value="1" />
    <el-option label="7 日" :value="7" />
    <el-option label="30 日" :value="30" />
  </el-select>
</template>
