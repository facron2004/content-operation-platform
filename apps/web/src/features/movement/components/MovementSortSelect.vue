<script setup lang="ts">
const model = defineModel<'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc'>({ required: true });
defineEmits<{ change: [] }>();
</script>
<template>
  <el-select v-model="model" size="small" style="width: 140px" @change="$emit('change')">
    <el-option label="上次销售日(最早)" value="lastSalesDateAsc" />
    <el-option label="距今天数(降序)" value="staleDesc" />
    <el-option label="30 天 GMV(降序)" value="gmvDesc" />
  </el-select>
</template>
