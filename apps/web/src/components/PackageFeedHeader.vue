<template>
  <div class="feed-title">
    <div>
      <p class="eyebrow">{{ selectedPackage.areaName }} / {{ selectedPackage.category }}</p>
      <h3>{{ selectedPackage.packageName }}</h3>
      <span>{{ selectedPackage.merchantName }}</span>
    </div>
    <div class="feed-tags">
      <el-tag
        v-if="selectedPackage.inventoryFlag !== 'normal'"
        :type="inventoryTagType(selectedPackage.inventoryFlagLevel)"
        effect="dark"
      >
        {{ selectedPackage.inventoryFlagLabel }}
      </el-tag>
      <el-tag :type="salesTagType(selectedPackage.inventorySalesLevel)" effect="plain">
        {{ selectedPackage.inventorySalesLabel }}
      </el-tag>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { RecommendPackageItem } from '@content/shared';
import { inventoryTagType, salesTagType } from '../utils/labels';
defineProps<{ selectedPackage: RecommendPackageItem }>();
</script>
