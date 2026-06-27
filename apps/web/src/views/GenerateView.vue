<template>
  <section class="page-stack ai-generate-page">
    <div class="ai-console-grid">
      <AiConfigPanel
        v-model:form="form"
        v-model:config-form="configForm"
        :ai-status="aiStatus"
        :config-saving="configSaving"
        :loading="loading"
        :generation-mode="generationMode"
        :packages="packages"
        :channel-options="channelOptions"
        @refresh-status="loadAICopyStatus"
        @save-config="saveAICopyConfig"
        @generate="generate"
      />

      <PackageFeedPanel
        :selected-package="selectedPackage"
        :package-detail="packageDetail"
        :detail-loading="detailLoading"
        :package-id="form.packageId"
        :feed-facts="feedFacts"
        :feed-checks="feedChecks"
        :format-detail-items="formatDetailItems"
        @refresh="refreshDetail"
      />
    </div>

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
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useGenerate } from '../composables/useGenerate';
import AiConfigPanel from '../components/AiConfigPanel.vue';
import PackageFeedPanel from '../components/PackageFeedPanel.vue';
import BattleCardPanel from '../components/BattleCardPanel.vue';
import CopyResultsPanel from '../components/CopyResultsPanel.vue';

const route = useRoute();

const {
  loading,
  detailLoading,
  configSaving,
  generationMode,
  packages,
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
  loadPackages,
  loadAICopyStatus,
  loadPackageDetail,
  loadBattleCard,
  refreshDetail,
  saveAICopyConfig,
  generate,
  formatDetailItems,
  copyText,
  riskTagType
} = useGenerate();

onMounted(async () => {
  await Promise.all([loadPackages(), loadAICopyStatus()]);
  if (form.packageId) await loadPackageDetail(form.packageId);
  if (route.query.mode === 'battle-card' && form.packageId) await loadBattleCard();
});
</script>

<style scoped>
.ai-console-grid {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 18px;
}

@media (max-width: 980px) {
  .ai-console-grid {
    grid-template-columns: 1fr;
  }
}
</style>
