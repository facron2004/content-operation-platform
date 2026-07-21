<script setup lang="ts">
import { computed } from 'vue';
import { usePackageAnalysisPage } from '../composables/usePackageAnalysisPage';
import PackageAnalysisHero from '../features/package-analysis/components/PackageAnalysisHero.vue';
import PackageAnalysisInfoPanel from '../features/package-analysis/components/PackageAnalysisInfoPanel.vue';
import PackageAnalysisDetails from '../features/package-analysis/components/PackageAnalysisDetails.vue';
import PackageAnalysisAlerts from '../features/package-analysis/components/PackageAnalysisAlerts.vue';
import PackageAnalysisAngles from '../features/package-analysis/components/PackageAnalysisAngles.vue';
import PackageAnalysisScorePanel from '../features/package-analysis/components/PackageAnalysisScorePanel.vue';
import { buildPackagePriceDisplay } from '../features/package-analysis/package-analysis-ui';
const props = defineProps<{ packageId: string }>(),
  { loading, analysis, pkg, scoreOption, formatInventoryTrend, goBack } = usePackageAnalysisPage(
    props.packageId
  ),
  priceDisplay = computed(() => buildPackagePriceDisplay(pkg.value));
</script>
<template>
  <section v-loading="loading" class="page-stack package-analysis-page">
    <PackageAnalysisHero v-if="pkg" :pkg="pkg" :analysis="analysis" @back="goBack" />
    <div v-if="pkg" class="analysis-content-grid">
      <PackageAnalysisInfoPanel
        :pkg="pkg"
        :price-display="priceDisplay"
        :inventory-flag-label="analysis.inventoryFlagLabel"
        :inventory-sales-label="analysis.inventorySalesLabel"
        :inventory-trend-text="formatInventoryTrend(analysis.inventoryTrend)"
      />
      <PackageAnalysisScorePanel :option="scoreOption" />
    </div>
    <PackageAnalysisAlerts
      v-if="pkg"
      :package-id="packageId"
      :pkg="pkg"
      :alerts="analysis.operationAlerts ?? []"
    />
    <PackageAnalysisDetails v-if="pkg" :pkg="pkg" :package-id="packageId" />
    <PackageAnalysisAngles
      v-if="pkg"
      :copy-angles="analysis.recommendation?.copyAngles ?? []"
      :risk-tips="analysis.recommendation?.riskTips ?? []"
    />
  </section>
</template>
<style src="../styles/views/package-analysis.css" scoped></style>
