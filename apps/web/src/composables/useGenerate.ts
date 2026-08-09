import { computed, onScopeDispose, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { BattleCard, Channel, GeneratedCopy, RecommendPackageItem } from '@content/shared';
import { extractErrorMessage } from '../services/http-client';
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
  // Residual #268: generate package picker first-200 / RECOMMEND_CACHE_CAP honesty.
  const listTruncated = ref(false);
  const listLimit = ref<number | null>(null);
  const matchedCount = ref<number | null>(null);
  const packageLoadError = ref<string | null>(null);
  const generationError = ref<string | null>(null);
  const copyError = ref<string | null>(null);
  const battleCardError = ref<string | null>(null);
  const battleCard = ref<BattleCard | null>(null),
    battleCardLoading = ref(false),
    form = reactive({
      packageId: String(route.query.packageId ?? ''),
      channel: 'wechat_group' as Channel,
      // Residual #238: DTO-ready scenario (empty → server DEFAULT_SCENARIO).
      scenario: '',
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
  let disposed = false;
  let packagesLoading = false;
  let packageRequestId = 0;
  let copyRequestId = 0;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    packageRequestId += 1;
    copyRequestId += 1;
    packagesLoading = false;
  };
  onScopeDispose(dispose, true);
  const actions = createGenerateActions({
    form,
    copies,
    generationError,
    battleCard,
    battleCardError,
    battleCardLoading,
    battleCardRequestId: { current: 0 },
    loading,
    generationMode,
    ai,
    detail
  });
  const loadPackages = async () => {
    if (disposed || packagesLoading) return;
    packagesLoading = true;
    const requestId = ++packageRequestId;
    packageLoadError.value = null;
    try {
      await loadGeneratePackages(
        packages,
        form,
        {
          listTruncated,
          listLimit,
          matchedCount
        },
        () => !disposed && requestId === packageRequestId,
        (error) => {
          if (!disposed && requestId === packageRequestId) {
            const detail = extractErrorMessage(error, '请稍后重试');
            packageLoadError.value = `部分套餐列表加载失败，已显示可用结果：${detail}`;
          }
        },
        (error) => {
          if (!disposed && requestId === packageRequestId) {
            const detail = extractErrorMessage(error, '请稍后重试');
            packageLoadError.value = `深链套餐上下文加载失败，已保留套餐 ID：${detail}`;
          }
        }
      );
    } catch (error) {
      if (!disposed && requestId === packageRequestId) {
        packageLoadError.value = extractErrorMessage(error, '套餐列表加载失败，请稍后重试');
      }
      throw error;
    } finally {
      if (!disposed && requestId === packageRequestId) packagesLoading = false;
    }
  };
  const copyText = async (copy: Parameters<typeof copyGeneratedText>[0]) => {
    if (disposed) return false;
    const requestId = ++copyRequestId;
    copyError.value = null;
    const copied = await copyGeneratedText(copy);
    if (disposed || requestId !== copyRequestId) return copied;
    if (copied) {
      ElMessage.success('已复制到剪贴板');
    } else {
      copyError.value = '复制失败，请手动复制';
      ElMessage.error('复制失败，请手动复制');
    }
    return copied;
  };
  return buildUseGenerateReturn({
    loading,
    generationMode,
    packages,
    copies,
    generationError,
    copyError,
    battleCard,
    battleCardError,
    battleCardLoading,
    form,
    ai,
    selectedPackage,
    detail,
    actions,
    loadPackages,
    channelOptions: GENERATE_CHANNEL_OPTIONS,
    copyText,
    riskTagType,
    listTruncated,
    listLimit,
    matchedCount,
    packageLoadError
  });
}
