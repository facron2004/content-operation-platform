import { ElMessage } from 'element-plus';
import { watch, type ComputedRef, type Ref } from 'vue';
import type { BattleCard, Channel, GeneratedCopy, RecommendPackageItem } from '@content/shared';
import { api } from '../services/api';
import type { useAICopyConfig } from './useAICopyConfig';
import type { usePackageDetail } from './usePackageDetail';

export const GENERATE_CHANNEL_OPTIONS = [
  { label: '微信群', value: 'wechat_group' },
  { label: '朋友圈', value: 'moments' },
  { label: '商家转发', value: 'merchant_share' }
];

export async function copyGeneratedText(copy: GeneratedCopy): Promise<void> {
  const text = `${copy.title}\n${copy.body}\n${copy.cta}`;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      Object.assign(textarea.style, { position: 'fixed', left: '-9999px', top: '-9999px' });
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    ElMessage.success('已复制到剪贴板');
  } catch {
    ElMessage.error('复制失败，请手动复制');
  }
}
export function riskTagType(level: GeneratedCopy['riskLevel']): 'success' | 'warning' | 'danger' {
  return level === 'low' ? 'success' : level === 'medium' ? 'warning' : 'danger';
}

export type GenerateActionParams = {
  form: {
    packageId: string;
    channel: Channel;
    tone: string;
    copyCount: number;
    extraInstruction: string;
  };
  copies: Ref<GeneratedCopy[]>;
  battleCard: Ref<BattleCard | null>;
  battleCardLoading: Ref<boolean>;
  battleCardRequestId: { current: number };
  loading: Ref<boolean>;
  generationMode: Ref<'ai' | 'rule' | null>;
  ai: ReturnType<typeof useAICopyConfig>;
  detail: ReturnType<typeof usePackageDetail>;
};

export async function loadGeneratePackages(
  packages: Ref<RecommendPackageItem[]>,
  form: { packageId: string }
) {
  const data = await api.getRecommendations();
  packages.value = data.packages;
  if (!form.packageId && packages.value[0]) form.packageId = packages.value[0].packageId;
}

export async function loadGenerateBattleCard(options: {
  packageId: string;
  battleCard: Ref<BattleCard | null>;
  battleCardLoading: Ref<boolean>;
  requestId: { current: number };
}) {
  if (!options.packageId) {
    ElMessage.warning('请选择套餐');
    return;
  }
  const requestId = ++options.requestId.current;
  options.battleCardLoading.value = true;
  try {
    const data = await api.generateBattleCard(options.packageId);
    if (requestId !== options.requestId.current) return;
    options.battleCard.value = data;
  } finally {
    if (requestId === options.requestId.current) options.battleCardLoading.value = false;
  }
}

export async function generateCopiesAction(options: {
  packageId: string;
  channel: Channel;
  tone: string;
  copyCount: number;
  extraInstruction: string;
  useAI: boolean;
  aiEnabled: boolean | undefined;
  missing: string[] | undefined;
  loading: Ref<boolean>;
  generationMode: Ref<'ai' | 'rule' | null>;
  copies: Ref<GeneratedCopy[]>;
}) {
  if (!options.packageId) {
    ElMessage.warning('请选择套餐');
    return;
  }
  if (options.useAI && options.aiEnabled === false) {
    ElMessage.warning(`AI接口未配置：缺少 ${(options.missing ?? []).join('、')}`);
    return;
  }
  options.loading.value = true;
  options.generationMode.value = options.useAI ? 'ai' : 'rule';
  try {
    const data = await api.generateCopies({
      packageId: options.packageId,
      channel: options.channel,
      tone: options.tone,
      copyCount: options.copyCount,
      extraInstruction: options.extraInstruction,
      useAI: options.useAI,
      createdBy: 'operator'
    });
    options.copies.value = data.contentList;
    ElMessage.success(
      `${options.useAI ? 'AI' : '规则兜底'}已生成 ${data.contentList.length} 条文案`
    );
  } catch {
    /* interceptor already surfaces errors */
  } finally {
    options.loading.value = false;
    options.generationMode.value = null;
  }
}

type PackageDetailApi = ReturnType<typeof usePackageDetail>;
export function bindGeneratePackageWatch(
  form: { packageId: string },
  copies: Ref<GeneratedCopy[]>,
  battleCard: Ref<BattleCard | null>,
  detail: PackageDetailApi
) {
  watch(
    () => form.packageId,
    (packageId) => {
      copies.value = [];
      battleCard.value = null;
      if (packageId) detail.loadPackageDetail(packageId);
      else {
        detail.packageDetail.value = null;
        detail.detailLoading.value = false;
      }
    }
  );
}

export function createGenerateActions(params: GenerateActionParams) {
  const loadBattleCard = () =>
    loadGenerateBattleCard({
      packageId: params.form.packageId,
      battleCard: params.battleCard,
      battleCardLoading: params.battleCardLoading,
      requestId: params.battleCardRequestId
    });
  const generate = async (useAI = true) => {
    await generateCopiesAction({
      packageId: params.form.packageId,
      channel: params.form.channel,
      tone: params.form.tone,
      copyCount: params.form.copyCount,
      extraInstruction: params.form.extraInstruction,
      useAI,
      aiEnabled: params.ai.aiStatus.value?.enabled,
      missing: params.ai.aiStatus.value?.missing,
      loading: params.loading,
      generationMode: params.generationMode,
      copies: params.copies
    });
  };
  bindGeneratePackageWatch(params.form, params.copies, params.battleCard, params.detail);
  return { loadBattleCard, generate };
}

type AiApi = ReturnType<typeof useAICopyConfig>;
type DetailApi = ReturnType<typeof usePackageDetail>;
export function buildUseGenerateReturn(p: {
  loading: Ref<boolean>;
  generationMode: Ref<'ai' | 'rule' | null>;
  packages: Ref<RecommendPackageItem[]>;
  copies: Ref<GeneratedCopy[]>;
  battleCard: Ref<BattleCard | null>;
  battleCardLoading: Ref<boolean>;
  form: {
    packageId: string;
    channel: Channel;
    tone: string;
    copyCount: number;
    extraInstruction: string;
  };
  ai: AiApi;
  selectedPackage: ComputedRef<RecommendPackageItem | undefined>;
  detail: DetailApi;
  actions: { loadBattleCard: () => Promise<void>; generate: (useAI?: boolean) => Promise<void> };
  loadPackages: () => Promise<void>;
  channelOptions: typeof GENERATE_CHANNEL_OPTIONS;
  copyText: typeof copyGeneratedText;
  riskTagType: typeof riskTagType;
}) {
  const {
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
    actions
  } = p;
  return {
    loading,
    detailLoading: detail.detailLoading,
    configSaving: ai.configSaving,
    generationMode,
    packages,
    copies,
    aiStatus: ai.aiStatus,
    packageDetail: detail.packageDetail,
    battleCard,
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
