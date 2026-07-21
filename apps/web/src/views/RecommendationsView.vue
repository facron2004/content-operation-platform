<template>
  <section class="page-stack">
    <RecommendationsFilterBar
      v-model:area-id="filters.areaId"
      v-model:category="filters.category"
      v-model:unsold-only="filters.unsoldOnly"
      :area-options="areaOptions"
      :category-options="categoryOptions"
      :loading="loading"
      @refresh="load(true)"
    />
    <RecommendationsTable
      :loading="loading"
      :items="items"
      :pagination="pagination"
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
