import { ElMessage } from 'element-plus';
import { onScopeDispose, watch, type Ref } from 'vue';
import type { BattleCard, Channel, GeneratedCopy, RecommendPackageItem } from '@content/shared';
import { api } from '../services/api';
import {
  mergeGeneratePackagePages,
  resolveGeneratePackagePageCount
} from '../features/generate/generate-package-picker';
import { extractErrorMessage } from '../services/http-client';
import { copyTextToClipboard } from '../utils/clipboard';
import type { useAICopyConfig } from './useAICopyConfig';
import type { usePackageDetail } from './usePackageDetail';

export { buildUseGenerateReturn } from './generate-return';

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

export async function copyGeneratedText(copy: GeneratedCopy): Promise<boolean> {
  const text = `${copy.title}\n${copy.body}\n${copy.cta}`;
  return copyTextToClipboard(text);
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
  generationError: Ref<string | null>;
  battleCard: Ref<BattleCard | null>;
  battleCardError: Ref<string | null>;
  battleCardLoading: Ref<boolean>;
  battleCardRequestId: { current: number };
  loading: Ref<boolean>;
  generationMode: Ref<'ai' | 'rule' | null>;
  ai: ReturnType<typeof useAICopyConfig>;
  detail: ReturnType<typeof usePackageDetail>;
};

/** Residual #268: generate package picker loads the bounded recommend head. */
export const GENERATE_PACKAGE_PICKER_PAGE_SIZE = 200;
export type GenerateRequestGuard = () => boolean;

export async function loadGeneratePackages(
  packages: Ref<RecommendPackageItem[]>,
  form: { packageId: string },
  // Residual #268: multi-page picker / RECOMMEND_CACHE_CAP honesty sinks.
  honesty?: {
    listTruncated?: Ref<boolean>;
    listLimit?: Ref<number | null>;
    matchedCount?: Ref<number | null>;
  },
  isCurrent: GenerateRequestGuard = () => true,
  onPartialPageError?: (error: unknown) => void,
  onDeepLinkPackageError?: (error: unknown) => void
) {
  if (!isCurrent()) return;
  // Bound picker list (API always pages; max pageSize=200).
  const data = await api.getRecommendations({
    page: 1,
    pageSize: GENERATE_PACKAGE_PICKER_PAGE_SIZE
  });
  if (!isCurrent()) return;
  const pageCount = resolveGeneratePackagePageCount(
    data.pagination?.totalPages,
    data.pagination?.total,
    GENERATE_PACKAGE_PICKER_PAGE_SIZE
  );
  const responses = [data];
  if (pageCount > 1) {
    let hasPartialPageError = false;
    let partialPageError: unknown;
    const pageResults = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, index) => index + 2).map(async (page) => {
        if (!isCurrent()) return null;
        try {
          const response = await api.getRecommendations({
            page,
            pageSize: GENERATE_PACKAGE_PICKER_PAGE_SIZE
          });
          return isCurrent() ? response : null;
        } catch (error) {
          if (!hasPartialPageError) {
            hasPartialPageError = true;
            partialPageError = error;
          }
          return null;
        }
      })
    );
    responses.push(...pageResults.filter((response): response is typeof data => response !== null));
    if (hasPartialPageError && isCurrent()) onPartialPageError?.(partialPageError);
  }
  if (!isCurrent()) return;
  packages.value = mergeGeneratePackagePages(responses.map((response) => response.packages ?? []));
  // Residual #268: sink recommend honesty (#267) after loading the available pages.
  // truncated when RECOMMEND_CACHE_CAP clips the ranked head or a page cannot load.
  const pageTotal =
    typeof data.pagination?.total === 'number' && Number.isFinite(data.pagination.total)
      ? Math.max(0, Math.floor(data.pagination.total))
      : packages.value.length;
  const capTruncated =
    data.truncated === true || responses.some((response) => response.truncated === true);
  const pageTruncated = pageTotal > packages.value.length || responses.length < pageCount;
  const nextTruncated = capTruncated || pageTruncated;
  // Prefer the visible picker head size when page-clipped; else RECOMMEND_CACHE_CAP.
  const nextLimit = nextTruncated
    ? pageTruncated
      ? Math.max(GENERATE_PACKAGE_PICKER_PAGE_SIZE, packages.value.length)
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
      if (isCurrent() && analysis?.package?.packageId === form.packageId) {
        packages.value = [analysis.package, ...packages.value];
      } else if (isCurrent()) {
        onDeepLinkPackageError?.(new Error('套餐分析未返回当前套餐'));
      }
    } catch (error) {
      if (isCurrent()) onDeepLinkPackageError?.(error);
      // Keep form.packageId; generate / battle-card / detail still work by id.
    }
  }
  if (isCurrent() && !form.packageId && packages.value[0]) {
    form.packageId = packages.value[0].packageId;
  }
}

export async function loadGenerateBattleCard(options: {
  packageId: string;
  battleCard: Ref<BattleCard | null>;
  battleCardError: Ref<string | null>;
  battleCardLoading: Ref<boolean>;
  requestId: { current: number };
  isCurrent?: GenerateRequestGuard;
}) {
  const isCurrent = options.isCurrent ?? (() => true);
  if (!isCurrent()) return;
  if (!options.packageId) {
    ElMessage.warning('请选择套餐');
    return;
  }
  if (options.battleCardLoading.value) return;
  const requestId = ++options.requestId.current;
  options.battleCardError.value = null;
  options.battleCardLoading.value = true;
  try {
    const data = await api.generateBattleCard(options.packageId);
    if (!isCurrent() || requestId !== options.requestId.current) return;
    options.battleCard.value = data;
  } catch (error) {
    if (isCurrent() && requestId === options.requestId.current) {
      options.battleCardError.value = extractErrorMessage(error, '作战卡生成失败，请稍后重试');
    }
  } finally {
    if (isCurrent() && requestId === options.requestId.current) {
      options.battleCardLoading.value = false;
    }
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
  generationError: Ref<string | null>;
  isCurrent?: () => boolean;
}) {
  const isCurrent = options.isCurrent ?? (() => true);
  if (!isCurrent() || options.loading.value) return;
  options.generationError.value = null;
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
      useAI: options.useAI
    });
    if (!isCurrent()) return;
    options.copies.value = data.contentList;
    ElMessage.success(
      `${options.useAI ? 'AI' : '规则兜底'}已生成 ${data.contentList.length} 条文案`
    );
  } catch (error) {
    if (isCurrent()) {
      options.generationError.value = extractErrorMessage(error, '文案生成失败，请稍后重试');
    }
  } finally {
    if (isCurrent()) {
      options.loading.value = false;
      options.generationMode.value = null;
    }
  }
}

type PackageDetailApi = ReturnType<typeof usePackageDetail>;
export function bindGeneratePackageWatch(
  form: { packageId: string },
  copies: Ref<GeneratedCopy[]>,
  battleCard: Ref<BattleCard | null>,
  detail: PackageDetailApi,
  battleCardError?: Ref<string | null>,
  generationError?: Ref<string | null>,
  battleCardLoading?: Ref<boolean>,
  battleCardRequestId?: { current: number }
) {
  watch(
    () => form.packageId,
    (packageId) => {
      if (battleCardRequestId) battleCardRequestId.current += 1;
      if (battleCardLoading) battleCardLoading.value = false;
      if (battleCardError) battleCardError.value = null;
      if (generationError) generationError.value = null;
      copies.value = [];
      battleCard.value = null;
      if (packageId) detail.loadPackageDetail(packageId);
      else detail.clearDetail();
    }
  );
}

export function createGenerateActions(params: GenerateActionParams) {
  let disposed = false;
  let generationRequestId = 0;

  onScopeDispose(() => {
    disposed = true;
    generationRequestId += 1;
    params.battleCardRequestId.current += 1;
    params.loading.value = false;
    params.generationMode.value = null;
    params.battleCardLoading.value = false;
  }, true);

  const loadBattleCard = () => {
    if (disposed) return Promise.resolve();
    return loadGenerateBattleCard({
      packageId: params.form.packageId,
      battleCard: params.battleCard,
      battleCardError: params.battleCardError,
      battleCardLoading: params.battleCardLoading,
      requestId: params.battleCardRequestId,
      isCurrent: () => !disposed
    });
  };
  const generate = async (useAI = true) => {
    if (disposed || params.loading.value) return;
    const requestId = ++generationRequestId;
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
      copies: params.copies,
      generationError: params.generationError,
      isCurrent: () => !disposed && requestId === generationRequestId
    });
  };
  bindGeneratePackageWatch(
    params.form,
    params.copies,
    params.battleCard,
    params.detail,
    params.battleCardError,
    params.generationError,
    params.battleCardLoading,
    params.battleCardRequestId
  );
  return { loadBattleCard, generate };
}
