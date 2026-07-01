<template>
  <section class="page-stack ai-generate-page">
    <section class="generate-hero panel">
      <div class="hero-copy-block">
        <p class="eyebrow">AI Content Studio</p>
        <h2>作战卡与文案生成中心</h2>
        <p class="hero-copy">
          先选套餐，再看喂给 AI 的信息，最后输出可直接审核和分发的作战卡与文案。
        </p>
      </div>
      <div class="hero-actions">
        <div class="hero-chip">
          <span>当前套餐</span>
          <strong>{{ selectedPackage?.packageName || '未选择' }}</strong>
        </div>
        <div class="hero-chip">
          <span>生成模式</span>
          <strong>{{ generationModeLabel }}</strong>
        </div>
        <div class="hero-chip hero-chip-accent">
          <span>结果</span>
          <strong>{{ copies.length }} 条文案</strong>
        </div>
      </div>
    </section>

    <section class="workflow-strip panel">
      <div class="workflow-copy">
        <h3>当前流程</h3>
        <p>把套餐信息、AI 配置和结果输出放在一条链路里，减少来回切换。</p>
      </div>
      <div class="workflow-steps">
        <div
          v-for="step in workflowSteps"
          :key="step.key"
          class="workflow-step"
          :class="step.state"
        >
          <span>{{ step.index }}</span>
          <strong>{{ step.label }}</strong>
          <small>{{ step.description }}</small>
        </div>
      </div>
    </section>

    <div class="ai-console-grid">
      <AiConfigPanel
        v-model:form="form"
        v-model:config-form="configForm"
        :ai-status="aiStatus"
        :config-saving="configSaving"
        :loading="loading"
        :generation-mode="generationMode"
        :packages="packages"
        :channel-options="channelOptions"
        @refresh-status="loadAICopyStatus"
        @save-config="saveAICopyConfig"
        @generate="generate"
      />

      <PackageFeedPanel
        :selected-package="selectedPackage"
        :package-detail="packageDetail"
        :detail-loading="detailLoading"
        :package-id="form.packageId"
        :feed-facts="feedFacts"
        :feed-checks="feedChecks"
        :format-detail-items="formatDetailItems"
        @refresh="refreshDetail"
      />
    </div>

    <BattleCardPanel
      :selected-package="selectedPackage"
      :battle-card="battleCard"
      :battle-card-loading="battleCardLoading"
      @generate="loadBattleCard"
    />

    <CopyResultsPanel :copies="copies" :risk-tag-type="riskTagType" @copy="copyText" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useGenerate } from '../composables/useGenerate';
import AiConfigPanel from '../components/AiConfigPanel.vue';
import PackageFeedPanel from '../components/PackageFeedPanel.vue';
import BattleCardPanel from '../components/BattleCardPanel.vue';
import CopyResultsPanel from '../components/CopyResultsPanel.vue';

const route = useRoute();

const {
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
} = useGenerate();

const generationModeLabel = computed(() =>
  generationMode.value === 'ai'
    ? 'AI 生成中'
    : generationMode.value === 'rule'
      ? '规则兜底'
      : '待选择'
);

const workflowSteps = computed(() => [
  {
    key: 'package',
    index: '01',
    label: '选择套餐',
    description: selectedPackage.value ? '已选中当前套餐' : '先选一个要生成的套餐',
    state: selectedPackage.value ? 'done' : 'active'
  },
  {
    key: 'feed',
    index: '02',
    label: '检查输入',
    description: packageDetail.value?.sections.length
      ? `${packageDetail.value.sections.length} 组明细已喂给模型`
      : '确认套餐明细、规则和价格口径',
    state: packageDetail.value?.sections.length ? 'done' : 'active'
  },
  {
    key: 'build',
    index: '03',
    label: '生成作战卡',
    description: battleCard.value ? '作战卡已生成，可继续产文案' : '先生成推荐原因和多场景写法',
    state: battleCard.value ? 'done' : 'active'
  },
  {
    key: 'output',
    index: '04',
    label: '输出文案',
    description: copies.value.length
      ? `已输出 ${copies.value.length} 条文案`
      : '生成后进入审核和分发',
    state: copies.value.length ? 'done' : 'active'
  }
]);

onMounted(async () => {
  try {
    await Promise.all([loadPackages(), loadAICopyStatus()]);
    if (form.packageId) await loadPackageDetail(form.packageId);
    if (route.query.mode === 'battle-card' && form.packageId) await loadBattleCard();
  } catch {
    // 错误已由拦截器处理
  }
});
</script>

<style scoped>
.ai-generate-page {
  gap: 14px;
}

.generate-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 30%),
    linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
}

.hero-copy-block {
  min-width: 0;
}

.generate-hero h2 {
  margin: 4px 0 0;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
}

.hero-copy {
  max-width: 62ch;
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.hero-actions {
  display: grid;
  gap: 8px;
  min-width: 180px;
}

.hero-chip {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}

.hero-chip-accent {
  border-color: var(--accent-line);
  background: var(--accent-soft);
}

.hero-chip span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.hero-chip strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 800;
}

.workflow-strip {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
}

.workflow-copy {
  min-width: 180px;
  max-width: 260px;
}

.workflow-copy h3 {
  margin: 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 800;
}

.workflow-copy p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.workflow-steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  flex: 1;
}

.workflow-step {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}

.workflow-step span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--soft);
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
}

.workflow-step strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 800;
}

.workflow-step small {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.workflow-step.done {
  border-color: rgba(5, 150, 105, 0.18);
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.9), #fff);
}

.workflow-step.done span {
  background: var(--success-soft);
  color: var(--success);
}

.workflow-step.active {
  border-color: var(--accent-line);
  background: linear-gradient(180deg, rgba(238, 244, 255, 0.95), #fff);
}

.workflow-step.active span {
  background: var(--accent-soft);
  color: var(--accent);
}

.ai-console-grid {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 18px;
}

@media (max-width: 980px) {
  .ai-console-grid,
  .generate-hero,
  .workflow-strip {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .workflow-steps {
    grid-template-columns: 1fr;
  }

  .hero-actions {
    min-width: 0;
  }

  .workflow-copy {
    max-width: none;
  }
}
</style>
