import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { BattleCard, Channel, GeneratedCopy, RecommendPackageItem } from '@content/shared';
import { api, type AICopyStatus, type PackageDetailResponse } from '../services/api';
import { formatMoney, currentPrice } from '../utils/labels';

type PackageDetailData = NonNullable<PackageDetailResponse['data']>;
type PackageDetailItem = PackageDetailData['sections'][number]['items'][number];

export function useGenerate() {
  const route = useRoute();
  const loading = ref(false);
  const detailLoading = ref(false);
  const configSaving = ref(false);
  const generationMode = ref<'ai' | 'rule' | null>(null);
  const packages = ref<RecommendPackageItem[]>([]);
  const copies = ref<GeneratedCopy[]>([]);
  const aiStatus = ref<AICopyStatus | null>(null);
  const packageDetail = ref<PackageDetailData | null>(null);
  const battleCard = ref<BattleCard | null>(null);
  const battleCardLoading = ref(false);

  const form = reactive({
    packageId: String(route.query.packageId ?? ''),
    channel: 'wechat_group' as Channel,
    tone: '真实群主口吻',
    copyCount: 3,
    extraInstruction: ''
  });

  const configForm = reactive({
    apiKey: '',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    providerName: 'DeepSeek',
    temperature: 0.7,
    maxTokens: 900
  });

  const channelOptions = [
    { label: '微信群', value: 'wechat_group' },
    { label: '朋友圈', value: 'moments' },
    { label: '商家转发', value: 'merchant_share' }
  ];

  const selectedPackage = computed(() =>
    packages.value.find((item) => item.packageId === form.packageId)
  );

  const feedFacts = computed(() => {
    const pkg = selectedPackage.value;
    if (!pkg) return [];
    return [
      { label: '原价', value: formatMoney(pkg.originalPrice) },
      { label: '当前售价', value: formatMoney(currentPrice(pkg)) },
      { label: '今日库存', value: `${pkg.stockLeft} / ${pkg.stockTotal}` },
      { label: '销售判断', value: pkg.inventorySalesLabel },
      {
        label: '明细状态',
        value: packageDetail.value?.sections.length
          ? `${packageDetail.value.sections.length}组`
          : '未抓取'
      },
      { label: '价格口径', value: '一口价优先，否则临时售价' }
    ];
  });

  const feedChecks = computed(() => {
    const pkg = selectedPackage.value;
    if (!pkg) return [];
    return [
      {
        label: '价格',
        ok: currentPrice(pkg) > 0,
        text: currentPrice(pkg) > 0 ? `当前售价 ${formatMoney(currentPrice(pkg))}` : '缺少有效价格'
      },
      {
        label: '套餐明细',
        ok: Boolean(packageDetail.value?.sections.length),
        text: packageDetail.value?.sections.length
          ? `${packageDetail.value.sections.length} 组明细已喂给 AI`
          : '未抓到明细，会用基础字段兜底'
      },
      {
        label: '使用规则',
        ok: Boolean(pkg.useRules?.length),
        text: pkg.useRules?.length ? `${pkg.useRules.length} 条规则` : '缺少使用规则'
      },
      {
        label: '库存',
        ok: pkg.stockLeft >= 0,
        text: pkg.stockLeft > 0 ? `剩余 ${pkg.stockLeft} 份` : '已售罄，适合承接文案'
      }
    ];
  });

  const loadPackages = async () => {
    const data = await api.getRecommendations();
    packages.value = data.packages;
    if (!form.packageId && packages.value[0]) form.packageId = packages.value[0].packageId;
  };

  const loadAICopyStatus = async () => {
    aiStatus.value = await api.getAICopyStatus();
    syncConfigForm(aiStatus.value);
  };

  const syncConfigForm = (status: AICopyStatus) => {
    configForm.apiKey = '';
    configForm.baseURL = status.baseURL;
    configForm.model = status.model;
    configForm.providerName = status.providerName;
    configForm.temperature = status.temperature;
    configForm.maxTokens = status.maxTokens;
  };

  const loadPackageDetail = async (packageId: string) => {
    detailLoading.value = true;
    packageDetail.value = null;
    try {
      const response = await api.getPackageDetail(packageId);
      packageDetail.value = response.success && response.data ? response.data : null;
    } catch {
      packageDetail.value = null;
    } finally {
      detailLoading.value = false;
    }
  };

  const loadBattleCard = async () => {
    if (!form.packageId) return;
    battleCardLoading.value = true;
    try {
      battleCard.value = await api.generateBattleCard(form.packageId);
    } finally {
      battleCardLoading.value = false;
    }
  };

  const refreshDetail = () => {
    if (form.packageId) loadPackageDetail(form.packageId);
  };

  const saveAICopyConfig = async () => {
    if (!configForm.baseURL.trim() || !configForm.model.trim()) {
      ElMessage.warning('请填写接口地址和模型');
      return;
    }
    if (!configForm.apiKey.trim() && !aiStatus.value?.maskedApiKey) {
      ElMessage.warning('请填写 API Key');
      return;
    }

    configSaving.value = true;
    try {
      const payload = {
        baseURL: configForm.baseURL.trim(),
        model: configForm.model.trim(),
        providerName: configForm.providerName.trim() || undefined,
        temperature: configForm.temperature,
        maxTokens: configForm.maxTokens,
        ...(configForm.apiKey.trim() ? { apiKey: configForm.apiKey.trim() } : {})
      };
      aiStatus.value = await api.updateAICopyConfig(payload);
      syncConfigForm(aiStatus.value);
      ElMessage.success('AI接口配置已保存');
    } catch {
      // 错误已由拦截器处理
    } finally {
      configSaving.value = false;
    }
  };

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

  const formatDetailItems = (items: PackageDetailItem[]) =>
    items.map((item) => `${item.name}${item.quantity ? ` ${item.quantity}` : ''}`).join('、') ||
    '无明细';

  const copyText = async (copy: GeneratedCopy) => {
    const text = `${copy.title}\n${copy.body}\n${copy.cta}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers or non-HTTPS contexts
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

  watch(
    () => form.packageId,
    (packageId) => {
      if (packageId) {
        loadPackageDetail(packageId);
        battleCard.value = null;
      } else {
        packageDetail.value = null;
        battleCard.value = null;
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
