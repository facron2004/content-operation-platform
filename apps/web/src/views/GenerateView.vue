<template>
  <section class="page-stack ai-generate-page">
    <div class="ai-console-grid">
      <section class="panel ai-control-panel">
        <div class="panel-head">
          <h2>AI文案接口</h2>
          <el-tag :type="aiStatus?.enabled ? 'success' : 'danger'">
            {{ aiStatus?.enabled ? '已接入' : '未配置' }}
          </el-tag>
        </div>

        <div class="ai-status-card" :class="{ offline: aiStatus && !aiStatus.enabled }">
          <div>
            <strong>{{ aiStatus?.providerName ?? '读取中' }}</strong>
            <span>{{ aiStatus?.model ?? '-' }}</span>
            <small>{{ aiStatus?.baseURL ?? '-' }}</small>
            <small>Key：{{ aiStatus?.maskedApiKey ?? '未配置' }}</small>
          </div>
          <el-button size="small" :icon="Refresh" @click="loadAICopyStatus">刷新</el-button>
        </div>

        <el-alert
          v-if="aiStatus && !aiStatus.enabled"
          type="warning"
          :closable="false"
          show-icon
          title="AI接口未配置"
          :description="`缺少 ${aiStatus.missing.join('、')}，配置后即可调用兼容接口生成。`"
        />

        <div class="config-box">
          <div class="config-head">
            <strong>接口配置</strong>
            <el-tag type="warning" effect="plain" size="small">仅本次运行生效，重启后需重新配置</el-tag>
          </div>
          <el-form label-position="top" :model="configForm" class="config-form">
            <el-form-item label="API Base URL">
              <el-input v-model="configForm.baseURL" placeholder="https://api.deepseek.com" />
            </el-form-item>
            <el-form-item label="模型">
              <el-input v-model="configForm.model" placeholder="deepseek-chat" />
            </el-form-item>
            <el-form-item label="服务名">
              <el-input v-model="configForm.providerName" placeholder="DeepSeek" />
            </el-form-item>
            <el-form-item label="API Key">
              <el-input
                v-model="configForm.apiKey"
                type="password"
                show-password
                autocomplete="new-password"
                :placeholder="aiStatus?.maskedApiKey ? `当前：${aiStatus.maskedApiKey}` : '请输入 API Key'"
              />
            </el-form-item>
            <div class="config-number-row">
              <el-form-item label="Temperature">
                <el-input-number v-model="configForm.temperature" :min="0" :max="2" :step="0.1" />
              </el-form-item>
              <el-form-item label="Max Tokens">
                <el-input-number v-model="configForm.maxTokens" :min="200" :max="4000" :step="100" />
              </el-form-item>
            </div>
            <el-button class="config-save-button" :loading="configSaving" @click="saveAICopyConfig">
              保存接口配置
            </el-button>
          </el-form>
        </div>

        <el-form label-position="top" :model="form" class="ai-form">
          <el-form-item label="套餐" required>
            <el-select v-model="form.packageId" filterable placeholder="选择套餐">
              <el-option
                v-for="item in packages"
                :key="item.packageId"
                :label="`${item.packageName} / ${item.areaName}`"
                :value="item.packageId"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="渠道" required>
            <el-segmented v-model="form.channel" :options="channelOptions" />
          </el-form-item>
          <el-form-item label="语气风格">
            <el-input v-model="form.tone" placeholder="例如：真实群主口吻" />
          </el-form-item>
          <el-form-item label="补充要求 / 模板参考">
            <el-input
              v-model="form.extraInstruction"
              type="textarea"
              :rows="3"
              resize="none"
              placeholder="可以贴模板、禁用词或具体口吻要求，例如：多强调工作日晚餐，别写官方广告腔"
            />
          </el-form-item>
          <el-form-item label="生成数量" required>
            <el-input-number v-model="form.copyCount" :min="1" :max="5" />
          </el-form-item>
          <div class="generate-actions">
            <el-button
              class="generate-button"
              type="primary"
              :icon="MagicStick"
              :loading="loading && generationMode === 'ai'"
              @click="generate(true)"
            >
              AI生成文案
            </el-button>
            <el-button
              class="generate-button"
              :loading="loading && generationMode === 'rule'"
              @click="generate(false)"
            >
              规则兜底生成
            </el-button>
          </div>
        </el-form>
      </section>

      <section class="panel ai-feed-panel">
        <div class="panel-head">
          <h2>喂给 AI 的套餐详情</h2>
          <el-button size="small" :icon="Refresh" :loading="detailLoading" :disabled="!form.packageId" @click="refreshDetail">
            刷新详情
          </el-button>
        </div>

        <EmptyState
          v-if="!selectedPackage"
          icon="📦"
          title="未选择套餐"
          description="选择套餐后会展示实际传给 AI 的核心信息"
        />

        <div v-else class="ai-feed">
          <div class="feed-title">
            <div>
              <p class="eyebrow">{{ selectedPackage.areaName }} / {{ selectedPackage.category }}</p>
              <h3>{{ selectedPackage.packageName }}</h3>
              <span>{{ selectedPackage.merchantName }}</span>
            </div>
            <div class="feed-tags">
              <el-tag v-if="selectedPackage.inventoryFlag !== 'normal'" :type="inventoryTagType(selectedPackage.inventoryFlagLevel)" effect="dark">
                {{ selectedPackage.inventoryFlagLabel }}
              </el-tag>
              <el-tag :type="salesTagType(selectedPackage.inventorySalesLevel)" effect="plain">
                {{ selectedPackage.inventorySalesLabel }}
              </el-tag>
            </div>
          </div>

          <div class="feed-facts">
            <div v-for="item in feedFacts" :key="item.label" class="feed-fact">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>

          <div class="quality-strip">
            <div v-for="item in feedChecks" :key="item.label" class="quality-check" :class="{ ok: item.ok }">
              <span>{{ item.label }}</span>
              <strong>{{ item.text }}</strong>
            </div>
          </div>

          <div class="feed-section-grid">
            <div class="feed-section">
              <h4>卖点</h4>
              <p>{{ selectedPackage.sellingPoints?.join('、') || '无' }}</p>
            </div>
            <div class="feed-section">
              <h4>使用规则</h4>
              <p>{{ selectedPackage.useRules?.join('、') || '无' }}</p>
            </div>
          </div>

          <div class="feed-detail">
            <div class="feed-detail-head">
              <h4>套餐明细</h4>
              <el-tag size="small" :type="packageDetail ? 'success' : 'info'">
                {{ packageDetail ? `${packageDetail.sections.length}组明细` : '使用基础信息' }}
              </el-tag>
            </div>
            <el-skeleton v-if="detailLoading" :rows="4" animated />
            <div v-else-if="packageDetail?.sections.length" class="detail-section-list">
              <div v-for="section in packageDetail.sections" :key="section.title" class="detail-section-item">
                <strong>{{ section.title }}{{ section.selectionRule ? `（${section.selectionRule}）` : '' }}</strong>
                <p>{{ formatDetailItems(section.items) }}</p>
              </div>
            </div>
            <p v-else class="muted-cell">未抓取到套餐明细，AI会使用套餐名称、价格、库存、卖点和规则生成。</p>
          </div>
        </div>
      </section>
    </div>

    <section v-if="selectedPackage" class="panel battle-card-panel">
      <div class="panel-head">
        <h2>套餐推广作战卡</h2>
        <el-button type="primary" :loading="battleCardLoading" @click="loadBattleCard">生成作战卡</el-button>
      </div>
      <div v-if="battleCard" class="battle-card-grid">
        <div class="battle-card-summary">
          <strong>{{ battleCard.packageName }}</strong>
          <p>{{ battleCard.recommendationReason }}</p>
          <div class="tag-cloud">
            <el-tag v-for="channel in battleCard.suitableChannels" :key="channel" effect="plain">
              {{ channelLabels[channel] }}
            </el-tag>
            <el-tag type="success">建议 {{ battleCard.recommendedPushTime }}</el-tag>
          </div>
        </div>
        <div class="battle-card-block">
          <span>适合人群</span>
          <p>{{ battleCard.targetAudience.join('、') }}</p>
        </div>
        <div class="battle-card-block">
          <span>主推卖点</span>
          <p>{{ battleCard.mainSellingPoints.join('、') }}</p>
        </div>
        <div class="battle-copy">
          <h3>社群文案</h3>
          <p>{{ battleCard.communityCopy }}</p>
        </div>
        <div class="battle-copy">
          <h3>朋友圈文案</h3>
          <p>{{ battleCard.momentsCopy }}</p>
        </div>
        <div class="battle-copy">
          <h3>商家转发文案</h3>
          <p>{{ battleCard.merchantShareCopy }}</p>
        </div>
        <div class="battle-copy">
          <h3>二次跟进</h3>
          <p>{{ battleCard.followUpCopy }}</p>
        </div>
        <div class="battle-copy">
          <h3>售罄承接</h3>
          <p>{{ battleCard.soldOutFallbackCopy }}</p>
        </div>
      </div>
      <EmptyState
        v-else
        icon="卡"
        title="等待生成作战卡"
        description="作战卡会一次生成推荐原因、人群、渠道、推送时间和多场景文案"
      />
    </section>

    <section class="panel result-panel">
      <div class="panel-head">
        <h2>生成结果</h2>
        <el-button text type="primary" @click="$router.push('/audit')">去审核</el-button>
      </div>
      <div v-if="copies.length === 0" class="copy-list">
        <EmptyState
          icon="✍️"
          title="等待生成"
          description="AI 或规则兜底生成后的文案会在这里进入审核流"
        />
      </div>
      <div v-else class="copy-list">
        <article v-for="copy in copies" :key="copy.contentId" class="copy-item">
          <div class="copy-head">
            <strong>{{ copy.copyVersion }} / {{ channelLabels[copy.channel] }}</strong>
            <el-tag :type="riskTagType(copy.riskLevel)">
              {{ copy.riskLevel }}
            </el-tag>
          </div>
          <h3>{{ copy.title }}</h3>
          <p>{{ copy.body }}</p>
          <div v-if="copy.riskTips?.length" class="copy-risk">
            <el-tag v-for="tip in copy.riskTips.slice(0, 2)" :key="tip" type="warning" effect="plain">
              {{ tip }}
            </el-tag>
          </div>
          <div class="copy-actions">
            <el-button size="small" :icon="CopyDocument" @click="copyText(copy)">复制</el-button>
            <el-button size="small" type="primary" @click="$router.push('/audit')">提交审核</el-button>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { CopyDocument, MagicStick, Refresh } from '@element-plus/icons-vue';
import type { BattleCard, Channel, GeneratedCopy, InventoryFlagLevel, InventorySalesLevel, RecommendPackageItem } from '@content/shared';
import { api, type AICopyStatus, type PackageDetailResponse } from '../services/api';
import { channelLabels, inventoryTagType, salesTagType, formatMoney } from '../utils/labels';
import EmptyState from '../components/EmptyState.vue';

type PackageDetailData = NonNullable<PackageDetailResponse['data']>;
type PackageDetailItem = PackageDetailData['sections'][number]['items'][number];

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

const selectedPackage = computed(() => packages.value.find((item) => item.packageId === form.packageId));

const currentPrice = (pkg: RecommendPackageItem) => pkg.temporarySalePrice ?? pkg.salePrice;

const feedFacts = computed(() => {
  const pkg = selectedPackage.value;
  if (!pkg) return [];
  return [
    { label: '原价', value: formatMoney(pkg.originalPrice) },
    { label: '当前售价', value: formatMoney(currentPrice(pkg)) },
    { label: '今日库存', value: `${pkg.stockLeft} / ${pkg.stockTotal}` },
    { label: '销售判断', value: pkg.inventorySalesLabel },
    { label: '明细状态', value: packageDetail.value?.sections.length ? `${packageDetail.value.sections.length}组` : '未抓取' },
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
      text: packageDetail.value?.sections.length ? `${packageDetail.value.sections.length} 组明细已喂给 AI` : '未抓到明细，会用基础字段兜底'
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error: unknown) {
    // 错误已由拦截器处理
  } finally {
    loading.value = false;
    generationMode.value = null;
  }
};

// formatMoney, inventoryTagType, salesTagType 已从 utils/labels.ts 导入

const formatDetailItems = (items: PackageDetailItem[]) =>
  items.map((item) => `${item.name}${item.quantity ? ` ${item.quantity}` : ''}`).join('、') || '无明细';

const copyText = async (copy: GeneratedCopy) => {
  try {
    await navigator.clipboard.writeText(`${copy.title}\n${copy.body}\n${copy.cta}`);
    ElMessage.success('已复制到剪贴板');
  } catch (error) {
    ElMessage.error('复制失败，请手动复制');
  }
};

// riskTagType 保留本地定义（GenerateView 的语义不同：low→success, medium→warning, high→danger）
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

onMounted(async () => {
  await Promise.all([loadPackages(), loadAICopyStatus()]);
  if (form.packageId) await loadPackageDetail(form.packageId);
  if (route.query.mode === 'battle-card' && form.packageId) await loadBattleCard();
});
</script>

<style scoped>
.ai-console-grid {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 18px;
}

.ai-control-panel {
  align-self: start;
}

.battle-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.battle-card-summary,
.battle-card-block,
.battle-copy {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.battle-card-summary {
  grid-column: span 3;
}

.battle-card-summary p,
.battle-card-block p,
.battle-copy p {
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.55;
  white-space: pre-line;
}

.battle-card-block span {
  color: var(--muted);
  font-size: 12px;
}

.battle-copy h3 {
  margin: 0;
  font-size: 15px;
}

.ai-status-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid var(--accent-line);
  border-radius: 8px;
  background: var(--accent-soft);
}

.ai-status-card.offline {
  border-color: #fed7aa;
  background: var(--warning-soft);
}

.ai-status-card strong,
.ai-status-card span,
.ai-status-card small {
  display: block;
}

.ai-status-card span {
  margin-top: 3px;
  color: var(--accent);
  font-weight: 700;
}

.ai-status-card small {
  max-width: 240px;
  margin-top: 4px;
  color: var(--muted);
  word-break: break-all;
}

.ai-form {
  margin-top: 16px;
}

.config-box {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f8fafc;
}

.config-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.config-head strong {
  color: var(--ink);
}

.config-head span {
  color: var(--muted);
  font-size: 12px;
}

.config-number-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.config-number-row :deep(.el-input-number) {
  width: 100%;
}

.config-save-button {
  width: 100%;
}

.generate-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.generate-button {
  width: 100%;
}

.ai-feed {
  display: grid;
  gap: 14px;
}

.feed-title,
.feed-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.feed-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  min-width: 120px;
}

.feed-title h3 {
  margin: 4px 0 6px;
  font-size: 21px;
  line-height: 1.35;
}

.feed-title span,
.feed-section p,
.feed-detail p {
  color: var(--ink-soft);
  line-height: 1.7;
}

.feed-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.quality-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.quality-check {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #fde68a;
  border-radius: 8px;
  background: var(--warning-soft);
}

.quality-check.ok {
  border-color: #bbf7d0;
  background: var(--success-soft);
}

.quality-check span {
  display: block;
  color: var(--muted);
  font-size: 12px;
}

.quality-check strong {
  display: block;
  margin-top: 6px;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.45;
}

.feed-fact,
.feed-section,
.feed-detail {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f8fafc;
}

.feed-fact span {
  display: block;
  color: var(--muted);
  font-size: 12px;
}

.feed-fact strong {
  display: block;
  margin-top: 6px;
  font-size: 16px;
  word-break: break-word;
}

.feed-section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.feed-section h4,
.feed-detail h4 {
  margin: 0 0 8px;
  font-size: 15px;
}

.feed-section p,
.feed-detail p {
  margin: 0;
  word-break: break-word;
}

.detail-section-list {
  display: grid;
  gap: 10px;
}

.detail-section-item {
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.detail-section-item:first-child {
  padding-top: 0;
  border-top: 0;
}

.muted-cell {
  color: var(--muted);
}

.copy-risk {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

@media (max-width: 980px) {
  .ai-console-grid,
  .feed-facts,
  .quality-strip,
  .feed-section-grid,
  .config-number-row {
    grid-template-columns: 1fr;
  }
}
</style>
