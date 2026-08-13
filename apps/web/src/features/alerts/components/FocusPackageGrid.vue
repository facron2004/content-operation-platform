<template>
  <section v-if="topPackages.length" class="panel focus-panel">
    <div class="panel-head">
      <div>
        <h2>优先处理套餐</h2>
        <p>按高危程度、预警数量和动作优先级排序</p>
      </div>
      <span class="muted-cell">点击卡片可直接进入套餐详情</span>
    </div>
    <!-- Residual #283: Top-N focus package head honesty. -->
    <p v-if="focusPackageTruncated" class="list-cap-hint">
      优先处理套餐仅展示优先级前 {{ focusPackageLimit }} 个（共
      {{ focusPackageMatched }} 个有预警套餐），其余未展示。
    </p>
    <div class="focus-grid">
      <FocusPackageCard
        v-for="item in topPackages"
        :key="item.packageId"
        :item="item"
        :resolving="resolving"
        :can-resolve="canResolve"
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
defineProps<{
  topPackages: AlertPackageFocus[];
  resolving: boolean;
  canResolve: boolean;
  focusPackageTruncated?: boolean;
  focusPackageLimit?: number;
  focusPackageMatched?: number;
}>();
defineEmits<{
  navigate: [packageId: string];
  'create-task': [packageId: string];
  'resolve-batch': [alertIds: string[], message: string];
}>();
</script>
<style src="../../../styles/components/focus-package-grid.css" scoped></style>
