<template>
  <section class="page-stack ai-generate-page">
    <GenerateHeroWorkflow
      :package-name="selectedPackage?.packageName"
      :mode-label="generationModeLabel"
      :copy-count="copies.length"
      :steps="workflowSteps"
    />
    <GenerateConsoleGrid
      v-model:form="form"
      v-model:config-form="configForm"
      :ai-status="aiStatus"
      :config-saving="configSaving"
      :loading="loading"
      :generation-mode="generationMode"
      :packages="packages"
      :channel-options="channelOptions"
      :selected-package="selectedPackage"
      :package-detail="packageDetail"
      :detail-loading="detailLoading"
      :feed-facts="feedFacts"
      :feed-checks="feedChecks"
      :format-detail-items="formatDetailItems"
      :truncated="listTruncated"
      :limit="listLimit"
      :matched-count="matchedCount"
      @refresh-status="loadAICopyStatus"
      @save-config="saveAICopyConfig"
      @generate="generate"
      @refresh-detail="refreshDetail"
    />
    <BattleCardPanel
      :selected-package="selectedPackage"
      :battle-card="battleCard"
      :battle-card-loading="battleCardLoading"
      @generate="loadBattleCard"
    />
    <CopyResultsPanel :copies="copies" :risk-tag-type="riskTagType" @copy="copyText" />
  </section>
</template>
<script setup lang="ts">
import BattleCardPanel from '../components/BattleCardPanel.vue';
import CopyResultsPanel from '../components/CopyResultsPanel.vue';
import GenerateHeroWorkflow from '../features/generate/components/GenerateHeroWorkflow.vue';
import GenerateConsoleGrid from '../features/generate/components/GenerateConsoleGrid.vue';
import { useGeneratePage } from '../features/generate/composables/useGeneratePage';
const {
  loading,
  detailLoading,
  configSaving,
  generationMode,
  packages,
  // Residual #268: generate package picker honesty.
  listTruncated,
  listLimit,
  matchedCount,
  copies,
  aiStatus,
  packageDetail,
  battleCard,
  battleCardLoading,
  form,
  configForm,
  channelOptions,
  selectedPackage,
  feedFacts,
  feedChecks,
  loadAICopyStatus,
  loadBattleCard,
  refreshDetail,
  saveAICopyConfig,
  generate,
  formatDetailItems,
  copyText,
  riskTagType,
  generationModeLabel,
  workflowSteps
} = useGeneratePage();
</script>
<style src="../styles/views/generate.css" scoped></style>
