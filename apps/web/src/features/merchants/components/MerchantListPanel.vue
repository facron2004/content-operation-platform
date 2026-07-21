<template>
  <section class="panel list-panel">
    <header class="list-header">
      <el-input
        :model-value="search"
        placeholder="搜索商家名"
        clearable
        size="small"
        @update:model-value="emit('update:search', $event)"
        @change="emit('search-change')"
      />
    </header>
    <MerchantListScroll
      :merchants="merchants"
      :selected-merchant-id="selectedMerchantId"
      :list-height="listHeight"
      @select="emit('select', $event)"
    />
    <div class="list-pagination">
      <el-button size="small" :disabled="page <= 1" @click="emit('prev')">上一页</el-button>
      <span class="page-info">第 {{ page }} 页</span>
      <el-button size="small" :disabled="!hasMore" @click="emit('next')">下一页</el-button>
    </div>
  </section>
</template>
<script setup lang="ts">
import MerchantListScroll from './MerchantListScroll.vue';
import type { MerchantListItem } from '../types/merchant-list-item';
defineProps<{
  merchants: MerchantListItem[];
  search: string;
  page: number;
  hasMore: boolean;
  selectedMerchantId?: string | null;
  listHeight: number | string;
}>();
const emit = defineEmits<{
  (e: 'update:search', value: string): void;
  (e: 'search-change'): void;
  (e: 'select', merchantId: string): void;
  (e: 'prev'): void;
  (e: 'next'): void;
}>();
</script>
