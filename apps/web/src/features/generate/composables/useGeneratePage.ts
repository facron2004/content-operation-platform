import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useGenerate } from '../../../composables/useGenerate';
import { bootstrapGeneratePage, useGenerateWorkflow } from '../generate-workflow';

export function useGeneratePage() {
  const route = useRoute(),
    generateState = useGenerate();
  const workflow = useGenerateWorkflow({
    generationMode: generateState.generationMode,
    selectedPackage: generateState.selectedPackage,
    packageDetail: generateState.packageDetail,
    battleCard: generateState.battleCard,
    copies: generateState.copies
  });
  onMounted(() =>
    bootstrapGeneratePage({
      mode: route.query.mode,
      packageId: generateState.form.packageId,
      loadPackages: generateState.loadPackages,
      loadAICopyStatus: generateState.loadAICopyStatus,
      loadPackageDetail: generateState.loadPackageDetail,
      loadBattleCard: generateState.loadBattleCard
    }).catch(() => undefined)
  );
  return { ...generateState, ...workflow };
}
