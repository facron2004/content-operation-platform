<template>
  <section v-loading="loading" class="page-stack overview">
    <div class="page-toolbar">
      <span class="page-toolbar__label">业务日</span>
      <el-date-picker
        :model-value="kpiDate || undefined"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="业务日"
        :clearable="false"
        style="width: 150px"
        @update:model-value="onKpiDateChange"
      />
      <AppleButton variant="secondary" size="sm" :loading="loading" @click="reload(true)">
        重新加载本地数据
      </AppleButton>
    </div>
    <ErrorAlert :message="loadError" />
    <OverviewKpiRow :kpi="kpi" @go-zero-sales="goZeroSales()" />
    <OverviewChartsRow
      v-model:trend-days="trendDays"
      v-model:stale-dim="staleDim"
      :trend-option="trendOption"
      :distribution-option="distributionOption"
      :distribution-truncated="distributionTruncated"
      :distribution-limit="distributionLimit"
      :distribution-matched="distributionMatched"
      @load-trend="loadTrend"
      @load-distribution="loadDistribution"
    />
    <OverviewOffendersTable
      :items="topOffenders"
      :loading="offendersLoading"
      :empty-text="offendersEmptyText"
      :row-class="offenderRowClass"
      :truncated="offendersTruncated"
      :limit="offendersLimit"
      :matched="offendersMatched"
      @go-zero-sales="goZeroSales"
    />
  </section>
</template>
<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import { useOverview } from '../features/overview/composables/useOverview';
import OverviewOffendersTable from '../features/overview/components/OverviewOffendersTable.vue';
import OverviewKpiRow from '../features/overview/components/OverviewKpiRow.vue';
import OverviewChartsRow from '../features/overview/components/OverviewChartsRow.vue';
import AppleButton from '../components/AppleButton.vue';
const {
  loading,
  loadError,
  kpi,
  topOffenders,
  offendersLoading,
  // Residual #287
  offendersTruncated,
  offendersLimit,
  offendersMatched,
  // Residual #288
  distributionTruncated,
  distributionLimit,
  distributionMatched,
  kpiDate,
  trendDays,
  staleDim,
  trendOption,
  distributionOption,
  offendersEmptyText,
  reload,
  loadTrend,
  loadDistribution,
  goZeroSales,
  offenderRowClass
} = useOverview();

function onKpiDateChange(value: string | null) {
  const next = value ? String(value) : kpiDate.value;
  if (next === kpiDate.value) return;
  kpiDate.value = next;
  reload();
}
</script>
<style src="../styles/views/overview.css" scoped></style>
