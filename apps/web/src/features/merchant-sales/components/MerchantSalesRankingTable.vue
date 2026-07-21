<script setup lang="ts">
import PaginationFooter from '../../../components/PaginationFooter.vue';
import MerchantSalesRankingColumns from './MerchantSalesRankingColumns.vue';
import MerchantSalesRankingHeader from './MerchantSalesRankingHeader.vue';

export type MerchantSalesRankingTableProps = {
  ranking: { items: Array<Record<string, unknown>>; pagination: { total: number } };
  rankingPagination: unknown;
  listLoading: boolean;
  sortBy: string;
  rowClass: (args: { row: Record<string, unknown> }) => string;
  rateClass: (value: number, warn: number, danger: number) => string;
  rateClassInv: (value: number, warn: number, danger: number) => string;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
};
defineProps<MerchantSalesRankingTableProps>();
defineEmits<{
  'update:sortBy': [value: string];
  'load-ranking': [];
  'page-change': [page: number];
  'size-change': [size: number];
}>();
</script>
<template>
  <section class="panel top-offenders">
    <MerchantSalesRankingHeader
      :sort-by="sortBy"
      @update:sort-by="$emit('update:sortBy', $event)"
      @load-ranking="$emit('load-ranking')"
    />
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
    <PaginationFooter
      v-if="ranking.pagination.total > 0"
      class="pagination-footer"
      :pagination="rankingPagination as never"
      @page-change="$emit('page-change', $event)"
      @size-change="$emit('size-change', $event)"
    />
  </section>
</template>
