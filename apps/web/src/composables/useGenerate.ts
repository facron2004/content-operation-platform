import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { BattleCard, Channel, GeneratedCopy, RecommendPackageItem } from '@content/shared';
import { useAICopyConfig } from './useAICopyConfig';
import { usePackageDetail } from './usePackageDetail';
import {
  GENERATE_CHANNEL_OPTIONS,
  buildUseGenerateReturn,
  copyGeneratedText,
  createGenerateActions,
  loadGeneratePackages,
  riskTagType
} from './generate-core';

export function useGenerate() {
  const route = useRoute(),
    loading = ref(false),
    generationMode = ref<'ai' | 'rule' | null>(null),
    packages = ref<RecommendPackageItem[]>([]),
    copies = ref<GeneratedCopy[]>([]);
  const battleCard = ref<BattleCard | null>(null),
    battleCardLoading = ref(false),
    form = reactive({
      packageId: String(route.query.packageId ?? ''),
      channel: 'wechat_group' as Channel,
      tone: '真实群主口吻',
      copyCount: 3,
      extraInstruction: ''
    });
  const ai = useAICopyConfig(),
    selectedPackage = computed(() => packages.value.find((i) => i.packageId === form.packageId));
  const detail = usePackageDetail(
    () => selectedPackage.value,
    () => form.packageId
  );
  const actions = createGenerateActions({
    form,
    copies,
    battleCard,
    battleCardLoading,
    battleCardRequestId: { current: 0 },
    loading,
    generationMode,
    ai,
    detail
  });
  return buildUseGenerateReturn({
    loading,
    generationMode,
    packages,
    copies,
    battleCard,
    battleCardLoading,
    form,
    ai,
    selectedPackage,
    detail,
    actions,
    loadPackages: () => loadGeneratePackages(packages, form),
    channelOptions: GENERATE_CHANNEL_OPTIONS,
    copyText: copyGeneratedText,
    riskTagType
  });
}
