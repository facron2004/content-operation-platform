<script setup lang="ts">
import type { ContentPackage } from '@content/shared';
import PackageAnalysisInfoCards from './PackageAnalysisInfoCards.vue';
defineProps<{
  pkg: ContentPackage;
  priceDisplay: { original: string; current: string; welfare: string };
  inventoryFlagLabel?: string | null;
  inventorySalesLabel?: string | null;
  inventoryTrendText: string;
}>();
</script>
<template>
  <section class="panel">
    <div class="panel-head"><h2>套餐基础信息</h2></div>
    <PackageAnalysisInfoCards
      :pkg="pkg"
      :price-display="priceDisplay"
      :inventory-flag-label="inventoryFlagLabel"
      :inventory-sales-label="inventorySalesLabel"
      :inventory-trend-text="inventoryTrendText"
    />
  </section>
</template>
