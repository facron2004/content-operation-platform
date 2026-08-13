<template>
  <section v-loading="loading" class="page-stack movement">
    <div class="page-toolbar">
      <span class="page-toolbar__label">业务日</span>
      <el-date-picker
        :model-value="kpiDate || undefined"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="业务日(默认今天)"
        clearable
        style="width: 170px"
        @update:model-value="onKpiDateChange"
      />
      <AppleButton variant="secondary" size="sm" :loading="loading" @click="reload(true)">
        重新加载本地数据
      </AppleButton>
    </div>
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
      :truncated="listTruncated"
      :limit="listLimit"
      :row-class="rowClass"
      @tab-change="onTabChange"
      @reload-list="reloadList"
      @export-csv="exportCsv"
      @analyze="goAnalysis"
      @timeline="openTimeline"
      @prev="prevPage"
      @next="nextPage"
    />
    <!-- Residual #210: stock/sales timeline (API + client existed unused). -->
    <MovementTimelineDrawer
      v-model="timelineDrawerVisible"
      :loading="timelineLoading"
      :package-id="timelinePackageId"
      :package-name="timelinePackageName"
      :merchant-name="timelineMerchantName"
      :days="timelineDays"
      :timeline="timelinePoints"
      :error="timelineError"
      @change-days="setTimelineDays"
    />
  </section>
</template>
<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import AppleButton from '../components/AppleButton.vue';
import MovementBucketSection from '../features/movement/components/MovementBucketSection.vue';
import MovementKpiRow from '../features/movement/components/MovementKpiRow.vue';
import MovementListBody from '../features/movement/components/MovementListBody.vue';
import MovementTimelineDrawer from '../features/movement/components/MovementTimelineDrawer.vue';
import { useMovementList } from '../features/movement/composables/useMovementList';
import { useMovementTimeline } from '../features/movement/composables/useMovementTimeline';
const {
  loading,
  listLoading,
  loadError,
  today,
  kpiDate,
  rows,
  activeTab,
  filters,
  page,
  hasMore,
  // Residual #266: MOVEMENT_CACHE_CAP honesty.
  listTruncated,
  listLimit,
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

function onKpiDateChange(value: string | null) {
  const next = value ?? '';
  if (next === kpiDate.value) return;
  kpiDate.value = next;
  reload();
}

// Residual #210: per-SKU stock/sales timeline drawer.
// Residual #234: setDays re-fetches with operator-selected window (7–90).
const {
  drawerVisible: timelineDrawerVisible,
  loading: timelineLoading,
  packageId: timelinePackageId,
  packageName: timelinePackageName,
  merchantName: timelineMerchantName,
  days: timelineDays,
  timeline: timelinePoints,
  error: timelineError,
  open: openTimeline,
  setDays: setTimelineDays
} = useMovementTimeline();
</script>
<!-- This page stylesheet is prefixed with .movement so it can reach child component internals. -->
<style src="../styles/views/movement-list.css"></style>
