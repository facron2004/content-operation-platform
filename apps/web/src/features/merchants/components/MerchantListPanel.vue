<template>
  <section class="panel list-panel">
    <header class="list-header">
      <el-input
        :model-value="search"
        placeholder="搜索商家名"
        clearable
        size="small"
        class="list-search"
        @update:model-value="emit('update:search', $event)"
        @change="emit('filter-change')"
      />
      <!-- Residual #219: areaId filter (API MerchantsListQueryDto.areaId existed unwired). -->
      <el-input
        :model-value="areaId"
        placeholder="areaId"
        clearable
        size="small"
        class="list-area"
        @update:model-value="emit('update:areaId', String($event ?? ''))"
        @change="emit('filter-change')"
      />
      <!-- Residual #219: sort (stale30Desc | totalSkuDesc | totalGmvDesc). -->
      <el-select
        :model-value="sort"
        size="small"
        class="list-sort"
        @update:model-value="emit('update:sort', String($event ?? 'stale30Desc'))"
        @change="emit('filter-change')"
      >
        <el-option
          v-for="opt in sortOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
    </header>
    <!-- Residual #266: MERCHANT_LIST_CACHE_CAP honesty. -->
    <p v-if="truncated" class="list-cap-hint">
      列表仅加载前 {{ limitLabel }} 家商家（缓存头）；分页在该上限内切换。可用搜索/区域收窄范围。
    </p>
    <MerchantListScroll
      :merchants="merchants"
      :selected-merchant-id="selectedMerchantId"
      :list-height="listHeight"
      @select="emit('select', $event)"
    />
    <div class="list-pagination">
      <AppleButton size="sm" variant="secondary" :disabled="page <= 1" @click="emit('prev')">
        上一页
      </AppleButton>
      <span class="page-info">第 {{ page }} 页</span>
      <AppleButton size="sm" variant="secondary" :disabled="!hasMore" @click="emit('next')">
        下一页
      </AppleButton>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import MerchantListScroll from './MerchantListScroll.vue';
import AppleButton from '../../../components/AppleButton.vue';
import type { MerchantListItem } from '../types/merchant-list-item';
const props = withDefaults(
  defineProps<{
    merchants: MerchantListItem[];
    search: string;
    areaId: string;
    sort: string;
    sortOptions: Array<{ label: string; value: string }>;
    page: number;
    hasMore: boolean;
    selectedMerchantId?: string | null;
    listHeight: number | string;
    // Residual #266: MERCHANT_LIST_CACHE_CAP honesty.
    truncated?: boolean;
    limit?: number | null;
  }>(),
  {
    selectedMerchantId: null,
    truncated: false,
    limit: null
  }
);
const limitLabel = computed(() =>
  typeof props.limit === 'number' && props.limit > 0 ? props.limit : 2000
);
const emit = defineEmits<{
  (e: 'update:search', value: string): void;
  (e: 'update:areaId', value: string): void;
  (e: 'update:sort', value: string): void;
  (e: 'filter-change'): void;
  (e: 'select', merchantId: string): void;
  (e: 'prev'): void;
  (e: 'next'): void;
}>();
</script>
<style scoped>
.list-cap-hint {
  margin: 6px 0 0;
  padding: 0 4px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fffbeb;
  border-radius: 4px;
}
</style>
