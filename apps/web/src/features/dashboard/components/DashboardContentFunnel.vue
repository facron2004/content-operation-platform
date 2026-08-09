<template>
  <!-- Residual #213: content funnel from existing getDashboardSummary client (was unused). -->
  <el-card v-loading="loading" class="content-funnel-card">
    <template #header>
      <!-- Residual #261: prefer API dateFrom/dateTo over hard-coded 90d label. -->
      <span>内容漏斗（{{ windowLabel }}）</span>
    </template>
    <ErrorAlert :message="loadError" />
    <p v-if="funnel.sourceError" class="list-cap-hint">
      {{ funnel.sourceError }}
    </p>
    <!-- Residual #291: status/top-package heads use the capped recommend source. -->
    <p v-if="funnel.sourceTruncated" class="list-cap-hint">
      推荐源仅加载前 {{ funnel.sourceLimit ?? 0 }} 个在售套餐（匹配
      {{ funnel.sourceMatchedCount ?? 0 }}），状态分布和套餐榜单可能不完整。
    </p>
    <el-row :gutter="16">
      <el-col :span="4">
        <MetricTile
          label="已生成"
          :value="funnel.generatedCount"
          clickable
          hint="点击查看文案审核"
          @activate="goAudit()"
        />
      </el-col>
      <el-col :span="4">
        <MetricTile
          label="待审核"
          :value="funnel.pendingCount"
          info
          clickable
          hint="点击查看待审文案"
          @activate="goAudit('pending')"
        />
      </el-col>
      <el-col :span="4">
        <MetricTile
          label="已通过"
          :value="funnel.approvedCount"
          clickable
          @activate="goAudit('approved')"
        />
      </el-col>
      <el-col :span="4">
        <MetricTile
          label="风险文案"
          :value="funnel.riskCount"
          danger
          clickable
          @activate="goAudit('risk')"
        />
      </el-col>
      <el-col :span="4">
        <MetricTile label="已推送" :value="funnel.pushedCount" />
      </el-col>
      <el-col :span="4">
        <MetricTile
          label="内容 GMV"
          :value="displayMoney(funnel, 'totalGmv')"
          :hint="conversionHint"
        />
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import MetricTile from '../../../components/MetricTile.vue';
import ErrorAlert from '../../../components/ErrorAlert.vue';
import { useContentFunnel } from '../composables/useContentFunnel';
import { displayMoney } from '../../../utils/format';

const router = useRouter();
const { loading, loadError, funnel } = useContentFunnel();

// Residual #261: INTERACTIVE_LIST_MAX_DAYS window bounds from API (#256 parity).
const windowLabel = computed(() => {
  const from = funnel.value.dateFrom;
  const to = funnel.value.dateTo;
  if (from && to) return `${from} ~ ${to}`;
  return '近 90 天';
});

const conversionHint = computed(() => {
  const c = funnel.value.contentConversionRate;
  const v = funnel.value.verifyConversionRate;
  // Rates are 0–1 ratios from API safeRatio.
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
  return `点击→下单 ${pct(c)} · 下单→核销 ${pct(v)}`;
});

/** Drill into audit queue with optional status filter. */
function goAudit(status?: string) {
  router.push({ name: 'audit', query: status ? { status } : {} });
}
</script>

<style scoped>
.content-funnel-card {
  margin-bottom: 16px;
}

.list-cap-hint {
  margin: 0 0 12px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
}
</style>
