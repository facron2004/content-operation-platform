<script setup lang="ts">
defineProps<{ sortBy: string }>();
defineEmits<{ 'update:sortBy': [value: string]; 'load-ranking': [] }>();
</script>
<template>
  <header>
    <h3>商家销售排行</h3>
    <el-radio-group
      :model-value="sortBy"
      size="small"
      @update:model-value="$emit('update:sortBy', String($event))"
      @change="$emit('load-ranking')"
    >
      <el-radio-button value="gmvDesc">按 GMV</el-radio-button>
      <el-radio-button value="refundDesc">按 退款</el-radio-button>
      <el-radio-button value="verifyDesc">按 核销</el-radio-button>
      <el-radio-button value="orderCountDesc">按 订单数</el-radio-button>
    </el-radio-group>
  </header>
</template>
