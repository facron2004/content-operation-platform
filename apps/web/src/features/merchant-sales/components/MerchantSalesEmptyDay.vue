<template>
  <EmptyState
    title="今日暂无商家销售数据"
    description="如数据为空,请到 GMV 看板点击右上角「刷新」拉取订单,或在下方手动触发商家重算。"
  >
    <AppleButton variant="primary" size="sm" :loading="exporting" @click="$emit('force-refresh')">
      手动重算商家销售
    </AppleButton>
  </EmptyState>
</template>
<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
import EmptyState from '../../../components/EmptyState.vue';
defineProps<{ exporting: boolean }>();
defineEmits<{ 'force-refresh': [] }>();
</script>
