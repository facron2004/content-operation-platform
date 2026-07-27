<template>
  <section class="page-stack">
    <RecommendationsFilterBar
      v-model:area-id="filters.areaId"
      v-model:merchant-id="filters.merchantId"
      v-model:category="filters.category"
      v-model:unsold-only="filters.unsoldOnly"
      v-model:inventory-min="filters.inventoryMin"
      v-model:inventory-max="filters.inventoryMax"
      v-model:date="filters.date"
      :area-options="areaOptions"
      :category-options="categoryOptions"
      :loading="loading"
      @refresh="load(true)"
    />
    <RecommendationsTable
      :loading="loading"
      :items="items"
      :pagination="pagination"
      :truncated="listTruncated"
      :limit="listLimit"
      :matched-count="matchedCount"
      @clear="clearFilters"
      @analysis="openAnalysis"
      @generate="goGenerate"
      @page-change="loadPage"
      @size-change="loadPage"
      @create-task="goCreateTask"
    />
  </section>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router';
import RecommendationsTable from '../features/recommendations/components/RecommendationsTable.vue';
import RecommendationsFilterBar from '../features/recommendations/components/RecommendationsFilterBar.vue';
import { useRecommendationsPage } from '../composables/useRecommendationsPage';
const router = useRouter();
const {
  loading,
  items,
  categoryOptions,
  areaOptions,
  filters,
  pagination,
  // Residual #267: RECOMMEND_CACHE_CAP honesty.
  listTruncated,
  listLimit,
  matchedCount,
  load,
  loadPage,
  clearFilters,
  openAnalysis,
  goGenerate
} = useRecommendationsPage();

function goCreateTask(packageId: string) {
  router.push({ name: 'tasks', query: { packageId } });
}
</script>
