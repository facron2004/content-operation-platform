import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { BattleCard, Channel, GeneratedCopy, RecommendPackageItem } from '@content/shared';
import { api } from '../services/api';
import { useAICopyConfig } from './useAICopyConfig';
import { usePackageDetail } from './usePackageDetail';

const channelOptions = [
  { label: '微信群', value: 'wechat_group' },
  { label: '朋友圈', value: 'moments' },
  { label: '商家转发', value: 'merchant_share' }
];

export function useGenerate() {
  const route = useRoute();
  const loading = ref(false);
  const generationMode = ref<'ai' | 'rule' | null>(null);
  const packages = ref<RecommendPackageItem[]>([]);
  const copies = ref<GeneratedCopy[]>([]);
  const battleCard = ref<BattleCard | null>(null);
  const battleCardLoading = ref(false);
  let battleCardRequestId = 0;

  const form = reactive({
    packageId: String(route.query.packageId ?? ''),
    channel: 'wechat_group' as Channel,
    tone: '真实群主口吻',
    copyCount: 3,
    extraInstruction: ''
  });

  // --- sub-composables ---
  const { configSaving, aiStatus, configForm, loadAICopyStatus, saveAICopyConfig } =
    useAICopyConfig();

  const selectedPackage = computed(() =>
    packages.value.find((item) => item.packageId === form.packageId)
  );

  const {
    detailLoading,
    packageDetail,
    feedFacts,
    feedChecks,
    loadPackageDetail,
    refreshDetail,
    formatDetailItems
  } = usePackageDetail(
    () => selectedPackage.value,
    () => form.packageId
  );

  // --- packages ---
  const loadPackages = async () => {
    const data = await api.getRecommendations();
    packages.value = data.packages;
    if (!form.packageId && packages.value[0]) form.packageId = packages.value[0].packageId;
  };

  // --- battle card ---
  const loadBattleCard = async () => {
    if (!form.packageId) {
      ElMessage.warning('请选择套餐');
      return;
    }
    const requestId = ++battleCardRequestId;
    battleCardLoading.value = true;
    try {
      const data = await api.generateBattleCard(form.packageId);
      if (requestId !== battleCardRequestId) return;
      battleCard.value = data;
    } finally {
      if (requestId === battleCardRequestId) {
        battleCardLoading.value = false;
      }
    }
  };

  // --- generation ---
  const generate = async (useAI = true) => {
    if (!form.packageId) {
      ElMessage.warning('请选择套餐');
      return;
    }
    if (useAI && aiStatus.value && !aiStatus.value.enabled) {
      ElMessage.warning(`AI接口未配置：缺少 ${aiStatus.value.missing.join('、')}`);
      return;
    }

    loading.value = true;
    generationMode.value = useAI ? 'ai' : 'rule';
    try {
      const data = await api.generateCopies({
        ...form,
        useAI,
        createdBy: 'operator'
      });
      copies.value = data.contentList;
      ElMessage.success(`${useAI ? 'AI' : '规则兜底'}已生成 ${data.contentList.length} 条文案`);
    } catch {
      // 错误已由拦截器处理
    } finally {
      loading.value = false;
      generationMode.value = null;
    }
  };

  // --- clipboard & helpers ---
  const copyText = async (copy: GeneratedCopy) => {
    const text = `${copy.title}\n${copy.body}\n${copy.cta}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
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
  };

  const riskTagType = (level: GeneratedCopy['riskLevel']) => {
    if (level === 'low') return 'success';
    if (level === 'medium') return 'warning';
    return 'danger';
  };

  // --- watch ---
  watch(
    () => form.packageId,
    (packageId) => {
      copies.value = [];
      battleCard.value = null;
      if (packageId) {
        loadPackageDetail(packageId);
      } else {
        packageDetail.value = null;
        detailLoading.value = false;
      }
    }
  );

  return {
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
  };
}
