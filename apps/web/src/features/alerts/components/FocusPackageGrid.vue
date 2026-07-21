<template>
  <section v-if="topPackages.length" class="panel focus-panel">
    <div class="panel-head">
      <div>
        <h2>优先处理套餐</h2>
        <p>按高危程度、预警数量和动作优先级排序</p>
      </div>
      <span class="muted-cell">点击卡片可直接进入套餐详情</span>
    </div>
    <div class="focus-grid">
      <FocusPackageCard
        v-for="item in topPackages"
        :key="item.packageId"
        :item="item"
        :resolving="resolving"
        @navigate="$emit('navigate', $event)"
        @create-task="$emit('create-task', $event)"
        @resolve-batch="(ids, msg) => $emit('resolve-batch', ids, msg)"
      />
    </div>
  </section>
</template>
<script setup lang="ts">
import type { AlertPackageFocus } from '../composables/useAlerts';
import FocusPackageCard from './FocusPackageCard.vue';
defineProps<{ topPackages: AlertPackageFocus[]; resolving: boolean }>();
defineEmits<{
  navigate: [packageId: string];
  'create-task': [packageId: string];
  'resolve-batch': [alertIds: string[], message: string];
}>();
</script>
<style src="../../../styles/components/focus-package-grid.css" scoped></style>
