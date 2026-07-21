<script setup lang="ts">
import type { ContentPackage } from '@content/shared';
defineProps<{
  pkg: ContentPackage;
  priceDisplay: { original: string; current: string; welfare: string };
  inventoryFlagLabel?: string | null;
  inventorySalesLabel?: string | null;
  inventoryTrendText: string;
}>();
</script>
<template>
  <div class="info-grid">
    <div class="info-card">
      <span>商家</span>
      <strong>{{ pkg.merchantName }}</strong>
    </div>
    <div class="info-card">
      <span>所属类型</span>
      <strong>{{ pkg.category }}</strong>
    </div>
    <div class="info-card">
      <span>原价</span>
      <strong>{{ priceDisplay.original }}</strong>
    </div>
    <div class="info-card">
      <span>当前售价</span>
      <strong>{{ priceDisplay.current }}</strong>
    </div>
    <div class="info-card">
      <span>福利价</span>
      <strong>{{ priceDisplay.welfare }}</strong>
    </div>
    <div class="info-card">
      <span>库存标记</span>
      <strong>{{ inventoryFlagLabel ?? '正常' }}</strong>
    </div>
    <div class="info-card">
      <span>销售判断</span>
      <strong>{{ inventorySalesLabel ?? '观察中' }}</strong>
    </div>
    <div class="info-card">
      <span>最近库存</span>
      <strong>{{ inventoryTrendText }}</strong>
    </div>
  </div>
</template>
