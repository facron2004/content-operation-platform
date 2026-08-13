<script setup lang="ts">
import { computed } from 'vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import AppleButton from '../components/AppleButton.vue';
import DataAnalysisBody from '../features/data-analysis/components/DataAnalysisBody.vue';
import { useDataAnalysisPage } from '../features/data-analysis/composables/useDataAnalysisPage';
import { useRoleStore } from '../stores/role';

const page = useDataAnalysisPage();
const roleStore = useRoleStore();
const canRefresh = computed(() => roleStore.permissions.includes('analytics:refresh'));
</script>

<template>
  <section v-loading="page.loading" class="page-stack da-view">
    <div class="page-toolbar">
      <AppleButton
        v-if="canRefresh"
        variant="secondary"
        size="sm"
        :loading="page.loading"
        :disabled="page.exporting"
        @click="page.reload(true)"
      >
        重新加载本地数据
      </AppleButton>
      <AppleButton
        variant="primary"
        size="sm"
        :loading="page.exporting"
        :disabled="!page.summary || page.loading"
        @click="page.onExport"
      >
        <template #icon>
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="m7 11 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </template>
        导出 Excel
      </AppleButton>
    </div>
    <ErrorAlert :message="page.loadError" />
    <ErrorAlert :message="page.exportError" />
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
