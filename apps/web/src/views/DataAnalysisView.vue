<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import DataAnalysisHero from '../features/data-analysis/components/DataAnalysisHero.vue';
import DataAnalysisBody from '../features/data-analysis/components/DataAnalysisBody.vue';
import { useDataAnalysisPage } from '../features/data-analysis/composables/useDataAnalysisPage';

const page = useDataAnalysisPage();
</script>

<template>
  <section v-loading="page.loading" class="page-stack da-view">
    <DataAnalysisHero
      :loading="page.loading"
      :exporting="page.exporting"
      :can-export="Boolean(page.summary)"
      @reload="page.reload"
      @export="page.onExport"
    />
    <ErrorAlert :message="page.loadError" />
    <DataAnalysisBody
      v-model:preset="page.preset"
      :summary="page.summary"
      :preset-labels="page.presetLabels"
      :custom-start="page.customStart"
      :custom-end="page.customEnd"
      :window-range="page.windowRange"
      :loading="page.loading"
      :daily-trend-option="page.dailyTrendOption"
      :channel-option="page.channelOption"
      @preset-change="page.onPresetChange"
      @range-change="page.onCustomRangeChange"
    />
  </section>
</template>

<!--
  Page stylesheet is unscoped on purpose: layout classes (.da-kpi-row, .da-mid-row, …)
  live on child feature components, and Vue scoped CSS would only stamp the parent
  root — leaving cards stacked as plain block elements (the "components missing"
  look). Matches GMV / merchant-sales page styles.
-->
<style src="../styles/views/data-analysis.css"></style>
