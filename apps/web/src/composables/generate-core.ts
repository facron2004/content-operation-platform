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

/** Residual #238: server scenarioWritingGoal / rule fallbacks key off these phrases. */
export const GENERATE_SCENARIO_PRESETS = [
  '日常运营推荐',
  '库存冲刺',
  '开抢提醒',
  '社群预告',
  '转化优化',
  '售罄承接'
] as const;

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
    scenario: string;
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

/** Residual #268: generate package picker loads a single recommend page (DTO max). */
export const GENERATE_PACKAGE_PICKER_PAGE_SIZE = 200;

export async function loadGeneratePackages(
  packages: Ref<RecommendPackageItem[]>,
  form: { packageId: string },
  // Residual #268: first-200 / RECOMMEND_CACHE_CAP honesty sinks.
  honesty?: {
    listTruncated?: Ref<boolean>;
    listLimit?: Ref<number | null>;
    matchedCount?: Ref<number | null>;
  }
) {
  // Bound picker list (API always pages; max pageSize=200).
  const data = await api.getRecommendations({
    page: 1,
    pageSize: GENERATE_PACKAGE_PICKER_PAGE_SIZE
  });
  packages.value = data.packages ?? [];
  // Residual #268: sink recommend honesty (#267) + first-page-only picker clip.
  // truncated when RECOMMEND_CACHE_CAP clips the ranked head OR more pages exist beyond 200.
  const pageTotal =
    typeof data.pagination?.total === 'number' && Number.isFinite(data.pagination.total)
      ? Math.max(0, Math.floor(data.pagination.total))
      : packages.value.length;
  const capTruncated = Boolean(data.truncated);
  const pageTruncated = pageTotal > packages.value.length;
  const nextTruncated = capTruncated || pageTruncated;
  // Prefer the visible picker head size when page-clipped; else RECOMMEND_CACHE_CAP.
  const nextLimit = nextTruncated
    ? pageTruncated
      ? GENERATE_PACKAGE_PICKER_PAGE_SIZE
      : typeof data.limit === 'number' && data.limit > 0
        ? data.limit
        : GENERATE_PACKAGE_PICKER_PAGE_SIZE
    : typeof data.limit === 'number' && data.limit > 0
      ? data.limit
      : null;
  const nextMatched =
    typeof data.matchedCount === 'number' && data.matchedCount >= 0
      ? data.matchedCount
      : pageTotal > 0
        ? pageTotal
        : null;
  if (honesty?.listTruncated) honesty.listTruncated.value = nextTruncated;
  if (honesty?.listLimit) honesty.listLimit.value = nextLimit;
  if (honesty?.matchedCount) honesty.matchedCount.value = nextMatched;
  // Residual #249: deep-link ?packageId= may fall outside the first-200 recommend page
  // (default sort). Resolve via analysis so the picker option + selectedPackage hydrate.
  if (form.packageId && !packages.value.some((p) => p.packageId === form.packageId)) {
    try {
      const analysis = await api.getPackageAnalysis(form.packageId);
      if (analysis?.package?.packageId === form.packageId) {
        packages.value = [analysis.package, ...packages.value];
      }
    } catch {
      // Keep form.packageId; generate / battle-card / detail still work by id.
    }
  }
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
  scenario: string;
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
    // Residual #238: empty scenario → undefined so server falls back to DEFAULT_SCENARIO.
    const data = await api.generateCopies({
      packageId: options.packageId,
      channel: options.channel,
      scenario: options.scenario.trim() || undefined,
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
      scenario: params.form.scenario,
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
  channelOptions: typeof GENERATE_CHANNEL_OPTIONS;
  copyText: typeof copyGeneratedText;
  riskTagType: typeof riskTagType;
  // Residual #268: generate package picker honesty.
  listTruncated?: Ref<boolean>;
  listLimit?: Ref<number | null>;
  matchedCount?: Ref<number | null>;
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
    // Residual #268: generate package picker honesty.
    listTruncated: p.listTruncated,
    listLimit: p.listLimit,
    matchedCount: p.matchedCount,
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
