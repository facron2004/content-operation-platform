<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import MerchantSalesRankingColumns from './MerchantSalesRankingColumns.vue';
import MerchantSalesRankingHeader from './MerchantSalesRankingHeader.vue';

export type MerchantSalesRankingTableProps = {
  ranking: {
    items: Array<Record<string, unknown>>;
    pagination: { total: number };
    // Residual #264: GMV_TOP_MERCHANTS_LIMIT honesty.
    truncated?: boolean;
    limit?: number;
    totalMerchants?: number;
  };
  rankingPagination: unknown;
  listLoading: boolean;
  sortBy: string;
  rowClass: (args: { row: Record<string, unknown> }) => string;
  rateClass: (value: number, warn: number, danger: number) => string;
  rateClassInv: (value: number, warn: number, danger: number) => string;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
};
const props = defineProps<MerchantSalesRankingTableProps>();
const emit = defineEmits<{
  'update:sortBy': [value: string];
  'load-ranking': [];
  'page-change': [page: number];
  'size-change': [size: number];
}>();

const tableScrollRef = ref<HTMLElement | null>(null);

function scrollToTop() {
  void nextTick(() => {
    if (tableScrollRef.value) tableScrollRef.value.scrollTop = 0;
  });
}

function onPageChange(page: number) {
  emit('page-change', page);
  scrollToTop();
}

function onSizeChange(size: number) {
  emit('size-change', size);
  scrollToTop();
}

const limitLabel = computed(() => {
  const lim = props.ranking.limit;
  if (typeof lim === 'number' && lim > 0) return lim;
  return props.ranking.pagination.total;
});
const totalMerchantsLabel = computed(() => {
  const t = props.ranking.totalMerchants;
  return typeof t === 'number' && t > 0 ? t : null;
});
</script>
<template>
  <section class="panel top-offenders">
    <MerchantSalesRankingHeader
      :sort-by="sortBy"
      @update:sort-by="$emit('update:sortBy', $event)"
      @load-ranking="$emit('load-ranking')"
    />
    <!-- Residual #264: ranking head is capped at GMV_TOP_MERCHANTS_LIMIT. -->
    <p v-if="ranking.truncated" class="ranking-cap-hint">
      排行仅加载前 {{ limitLabel }} 家商家
      <template v-if="totalMerchantsLabel != null">
        （窗口内共 {{ totalMerchantsLabel }} 家）
      </template>
      ；分页在该上限内切换。完整清单请用 CSV 导出（同样有 1000 行上限）或收窄窗口。
    </p>
    <div ref="tableScrollRef" class="ms-table-scroll">
      <el-table
        v-loading="listLoading"
        :data="ranking.items"
        size="small"
        empty-text="暂无数据"
        :row-class-name="rowClass"
      >
        <MerchantSalesRankingColumns
          :rate-class="rateClass"
          :rate-class-inv="rateClassInv"
          :format-number="formatNumber"
          :format-percent="formatPercent"
        />
      </el-table>
    </div>
    <PaginationFooter
      v-if="ranking.pagination.total > 0"
      class="pagination-footer ms-pager"
      :pagination="rankingPagination as never"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    />
  </section>
</template>
<style scoped>
.ranking-cap-hint {
  margin: 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 149, 0, 0.08);
  color: #c93400;
  font-size: 12px;
  line-height: 1.5;
}
</style>
