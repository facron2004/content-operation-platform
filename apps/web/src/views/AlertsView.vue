<template>
  <section v-loading="loading" class="page-stack alerts-page">
    <AlertsHero :loading="loading" :summary="summary" @reload="load(true)" />
    <ErrorAlert :message="loadError" />
    <ErrorAlert :message="actionError" />
    <!-- Residual #274: RESOLVED_ALERT_DAY_LIMIT silent clip honesty. -->
    <p v-if="resolvedIdsTruncated" class="list-cap-hint">
      今日已处理记录超过 {{ resolvedIdsLimit }} 条上限（已加载 {{ resolvedIdsLoaded }}
      条），部分已处理预警可能仍显示为待处理。
    </p>
    <!-- Residual #275: RECOMMEND_CACHE_CAP source undercount honesty. -->
    <p v-if="sourceTruncated" class="list-cap-hint">
      推荐源仅加载评分前 {{ sourceLimit }} 个在售套餐（匹配
      {{ sourceMatchedCount }}），预警汇总可能不完整。
    </p>
    <AlertMetrics :summary="summary" />
    <FocusPackageGrid
      :top-packages="topPackages"
      :resolving="resolving"
      :focus-package-truncated="focusPackageTruncated"
      :focus-package-limit="focusPackageLimit"
      :focus-package-matched="focusPackageMatched"
      @navigate="goAnalysis"
      @create-task="goCreateTask"
      @resolve-batch="resolveBatch"
    />
    <AlertListSection
      :filters="filters"
      :alerts="alerts"
      :pagination="pagination"
      :resolving="resolving"
      @update:keyword="filters.keyword = $event"
      @update:level="filters.level = $event"
      @update:type="filters.type = $event"
      @update:date="filters.date = $event"
      @clear="clearFilters"
      @open-detail="openAlert"
      @resolve="resolve"
      @resolve-page="resolveCurrentPage"
      @page-change="handlePageChange"
      @size-change="handleSizeChange"
    />
    <AlertDetailDrawer
      v-model="drawerVisible"
      :alert="selectedAlert"
      @go-analysis="goAnalysis"
      @go-battle="goBattleCard"
      @resolve="resolve"
    />
  </section>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAlertsPage } from '../features/alerts/composables/useAlertsPage';
import AlertMetrics from '../features/alerts/components/AlertMetrics.vue';
import FocusPackageGrid from '../features/alerts/components/FocusPackageGrid.vue';
import AlertListSection from '../features/alerts/components/AlertListSection.vue';
import AlertDetailDrawer from '../features/alerts/components/AlertDetailDrawer.vue';
import AlertsHero from '../features/alerts/components/AlertsHero.vue';
import ErrorAlert from '../components/ErrorAlert.vue';
const router = useRouter();
const {
  loading,
  resolving,
  loadError,
  actionError,
  alerts,
  summary,
  topPackages,
  // Residual #283
  focusPackageTruncated,
  focusPackageLimit,
  focusPackageMatched,
  // Residual #274
  resolvedIdsTruncated,
  resolvedIdsLimit,
  resolvedIdsLoaded,
  // Residual #275
  sourceTruncated,
  sourceLimit,
  sourceMatchedCount,
  filters,
  pagination,
  drawerVisible,
  selectedAlert,
  load,
  resolve,
  resolveBatch,
  resolveCurrentPage,
  clearFilters,
  handlePageChange,
  handleSizeChange,
  openAlert,
  goAnalysis,
  goBattleCard
} = useAlertsPage();
function goCreateTask(packageId: string) {
  router.push({ name: 'tasks', query: { packageId } });
}
</script>
<style src="../styles/views/alerts.css" scoped></style>
