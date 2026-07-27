<script setup lang="ts">
import { computed } from 'vue';
import type { RecommendPackageItem } from '@content/shared';
import EmptyState from '../../../components/EmptyState.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import TableSkeleton from '../../../components/TableSkeleton.vue';
import RecommendationsTableColumns from './RecommendationsTableColumns.vue';
const props = withDefaults(
  defineProps<{
    loading: boolean;
    items: RecommendPackageItem[];
    pagination: unknown;
    // Residual #267: RECOMMEND_CACHE_CAP honesty.
    truncated?: boolean;
    limit?: number | null;
    matchedCount?: number | null;
  }>(),
  {
    truncated: false,
    limit: null,
    matchedCount: null
  }
);
const limitLabel = computed(() =>
  typeof props.limit === 'number' && props.limit > 0 ? props.limit : 500
);
const matchedLabel = computed(() =>
  typeof props.matchedCount === 'number' && props.matchedCount >= 0 ? props.matchedCount : null
);
defineEmits<{
  load: [force?: boolean];
  'page-change': [];
  'size-change': [];
  clear: [];
  analysis: [row: RecommendPackageItem];
  generate: [packageId: string];
  'create-task': [packageId: string];
}>();
</script>
<template>
  <section class="panel">
    <!-- Residual #267: RECOMMEND_CACHE_CAP honesty. -->
    <p v-if="truncated" class="list-cap-hint">
      推荐列表仅加载评分最高的前 {{ limitLabel }} 条套餐
      <template v-if="matchedLabel != null">（匹配 {{ matchedLabel }} 条）</template>
      ；分页在该上限内切换。可用筛选条件收窄范围。
    </p>
    <TableSkeleton v-if="loading && items.length === 0" :rows="10" :columns="9" />
    <el-table
      v-else
      :data="items"
      height="520"
      :default-sort="{ prop: 'stockLeft', order: 'descending' }"
      @row-dblclick="$emit('analysis', $event)"
    >
      <RecommendationsTableColumns
        @analysis="$emit('analysis', $event)"
        @generate="$emit('generate', $event)"
        @create-task="$emit('create-task', $event)"
      />
      <template #empty>
        <EmptyState
          icon="🔍"
          title="暂无推荐套餐"
          description="当前筛选条件下没有找到符合的套餐，试试调整筛选条件"
          action-text="清空筛选"
          @action="$emit('clear')"
        />
      </template>
    </el-table>
    <PaginationFooter
      :pagination="pagination as never"
      :page-sizes="[30, 50, 100]"
      @page-change="$emit('page-change')"
      @size-change="$emit('size-change')"
    />
  </section>
</template>
<style src="../../../styles/components/recommendations-table.css" scoped></style>
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
