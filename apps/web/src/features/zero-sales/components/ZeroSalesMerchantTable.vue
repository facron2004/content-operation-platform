<script setup lang="ts">
import { computed } from 'vue';
import type { ZeroSalesMerchantRow } from '../composables/useZeroSales';
import ZeroSalesMerchantTableBody from './ZeroSalesMerchantTableBody.vue';
import AppleButton from '../../../components/AppleButton.vue';
const props = withDefaults(
  defineProps<{
    rows: ZeroSalesMerchantRow[];
    loading: boolean;
    page: number;
    hasMore: boolean;
    rowClassName: (data: { row: ZeroSalesMerchantRow }) => string;
    // Residual #266: ZERO_SALES_MERCHANTS_CACHE_CAP honesty.
    truncated?: boolean;
    limit?: number | null;
  }>(),
  {
    truncated: false,
    limit: null
  }
);
const limitLabel = computed(() =>
  typeof props.limit === 'number' && props.limit > 0 ? props.limit : 2000
);
const emit = defineEmits<{ prev: []; next: []; drill: [merchantId: string] }>();
</script>
<template>
  <section class="panel">
    <!-- Residual #266: ZERO_SALES_MERCHANTS_CACHE_CAP honesty. -->
    <p v-if="truncated" class="list-cap-hint">
      列表仅加载前 {{ limitLabel }} 家商家（缓存头）；分页在该上限内切换。可用筛选/搜索收窄范围。
    </p>
    <ZeroSalesMerchantTableBody
      :rows="rows"
      :loading="loading"
      :row-class-name="rowClassName"
      @drill="emit('drill', $event)"
    />
    <div class="pagination-row">
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
<style scoped>
.list-cap-hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fffbeb;
  border-radius: 4px;
  padding: 4px 8px;
}
</style>
