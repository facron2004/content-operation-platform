import type { ComputedRef, Ref } from 'vue';
import type { BattleCard, Channel, GeneratedCopy, RecommendPackageItem } from '@content/shared';
import type { useAICopyConfig } from './useAICopyConfig';
import type { usePackageDetail } from './usePackageDetail';

type AiApi = ReturnType<typeof useAICopyConfig>;
type DetailApi = ReturnType<typeof usePackageDetail>;

export function buildUseGenerateReturn(p: {
  loading: Ref<boolean>;
  generationMode: Ref<'ai' | 'rule' | null>;
  generationError: Ref<string | null>;
  packages: Ref<RecommendPackageItem[]>;
  copies: Ref<GeneratedCopy[]>;
  battleCard: Ref<BattleCard | null>;
  battleCardError: Ref<string | null>;
  battleCardLoading: Ref<boolean>;
  form: {
    packageId: string;
    channel: Channel;
    scenario: string;
    tone: string;
    copyCount: number;
    extraInstruction: string;
  };
  ai: AiApi;
  selectedPackage: ComputedRef<RecommendPackageItem | undefined>;
  detail: DetailApi;
  actions: { loadBattleCard: () => Promise<void>; generate: (useAI?: boolean) => Promise<void> };
  loadPackages: () => Promise<void>;
  channelOptions: Array<{ label: string; value: string }>;
  copyText: (copy: GeneratedCopy) => Promise<boolean>;
  copyError: Ref<string | null>;
  riskTagType: (level: GeneratedCopy['riskLevel']) => 'success' | 'warning' | 'danger';
  // Residual #268: generate package picker honesty.
  listTruncated?: Ref<boolean>;
  listLimit?: Ref<number | null>;
  matchedCount?: Ref<number | null>;
  packageLoadError: Ref<string | null>;
}) {
  const {
    loading,
    generationMode,
    generationError,
    copyError,
    packages,
    copies,
    battleCard,
    battleCardError,
    battleCardLoading,
    form,
    ai,
    selectedPackage,
    detail,
    actions
  } = p;
  return {
    loading,
    detailLoading: detail.detailLoading,
    generationError,
    copyError,
    detailError: detail.detailError,
    configSaving: ai.configSaving,
    configError: ai.configError,
    generationMode,
    packages,
    // Residual #268: generate package picker honesty.
    listTruncated: p.listTruncated,
    listLimit: p.listLimit,
    matchedCount: p.matchedCount,
    packageLoadError: p.packageLoadError,
    copies,
    aiStatus: ai.aiStatus,
    aiStatusError: ai.aiStatusError,
    packageDetail: detail.packageDetail,
    battleCard,
    battleCardError,
    battleCardLoading,
    form,
    configForm: ai.configForm,
    channelOptions: p.channelOptions,
    selectedPackage,
    feedFacts: detail.feedFacts,
    feedChecks: detail.feedChecks,
    loadPackages: p.loadPackages,
    loadAICopyStatus: ai.loadAICopyStatus,
    loadPackageDetail: detail.loadPackageDetail,
    loadBattleCard: actions.loadBattleCard,
    refreshDetail: detail.refreshDetail,
    saveAICopyConfig: ai.saveAICopyConfig,
    generate: actions.generate,
    formatDetailItems: detail.formatDetailItems,
    copyText: p.copyText,
    riskTagType: p.riskTagType
  };
}
