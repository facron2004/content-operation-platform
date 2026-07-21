<template>
  <section v-loading="loading" class="page-stack movement">
    <MovementHero :loading="loading" :today-text="todayText" :today="today" @reload="reload" />
    <ErrorAlert :message="loadError" />
    <MovementKpiRow :today="today" />
    <MovementBucketSection
      v-if="today"
      :bucket-distribution="today.bucketDistribution"
      :bucket-color="bucketColor"
      :bucket-label="bucketLabel"
      @bucket-click="onBucketClick"
    />
    <MovementListBody
      v-model:active-tab="activeTab"
      :filters="filters"
      :rows="rows"
      :list-loading="listLoading"
      :empty-text="emptyText"
      :page="page"
      :has-more="hasMore"
      :row-class="rowClass"
      @tab-change="onTabChange"
      @reload-list="reloadList"
      @export-csv="exportCsv"
      @analyze="goAnalysis"
      @prev="prevPage"
      @next="nextPage"
    />
  </section>
</template>
<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import MovementBucketSection from '../features/movement/components/MovementBucketSection.vue';
import MovementHero from '../features/movement/components/MovementHero.vue';
import MovementKpiRow from '../features/movement/components/MovementKpiRow.vue';
import MovementListBody from '../features/movement/components/MovementListBody.vue';
import { useMovementList } from '../features/movement/composables/useMovementList';
const {
  loading,
  listLoading,
  loadError,
  today,
  rows,
  activeTab,
  filters,
  page,
  hasMore,
  todayText,
  emptyText,
  reload,
  reloadList,
  onTabChange,
  onBucketClick,
  prevPage,
  nextPage,
  exportCsv,
  goAnalysis,
  rowClass,
  bucketLabel,
  bucketColor
} = useMovementList();
</script>
<style src="../styles/views/movement-list.css" scoped></style>
