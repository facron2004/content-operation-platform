<template>
  <section v-loading="loading" class="page-stack package-analysis-page">
    <section v-if="pkg" class="analysis-hero">
      <div class="analysis-copy">
        <el-button class="back-button" :icon="ArrowLeft" @click="goBack">返回套餐页</el-button>
        <p class="eyebrow">{{ pkg.areaName }} / {{ pkg.category }}</p>
        <h2>{{ pkg.packageName }}</h2>
        <div class="analysis-tags">
          <el-tag>{{ statusLabels[analysis.status] ?? analysis.status }}</el-tag>
          <el-tag v-if="analysis.inventoryFlag && analysis.inventoryFlag !== 'normal'" :type="inventoryTagType(analysis.inventoryFlagLevel)" effect="dark">
            {{ analysis.inventoryFlagLabel }}
          </el-tag>
          <el-tag v-if="analysis.inventorySalesLabel" :type="salesTagType(analysis.inventorySalesLevel)" effect="plain">
            {{ analysis.inventorySalesLabel }}
          </el-tag>
          <el-tag type="info">未售罄 {{ analysis.inventoryBacklogDays ?? 0 }} 天</el-tag>
          <el-tag
            v-for="tag in analysis.operationTags ?? []"
            :key="tag.key"
            :type="operationTagType(tag.level)"
            effect="light"
          >
            {{ tag.label }}
          </el-tag>
        </div>
      </div>
      <div class="score-block">
        <span>库存剩余</span>
        <strong>{{ pkg.stockLeft }}</strong>
        <small>总库存 {{ pkg.stockTotal }}</small>
      </div>
    </section>

    <div v-if="pkg" class="analysis-content-grid">
      <section class="panel">
        <div class="panel-head">
          <h2>套餐基础信息</h2>
        </div>
        <div class="info-grid">
          <div class="info-card">
            <span>商家</span>
            <strong>{{ pkg.merchantName }}</strong>
          </div>
          <div class="info-card">
            <span>所属类型</span>
            <strong>{{ pkg.category }}</strong>
          </div>
          <div class="info-card">
            <span>原价</span>
            <strong>{{ formatMoney(pkg.originalPrice) }}</strong>
          </div>
          <div class="info-card">
            <span>当前售价</span>
            <strong>{{ formatMoney(pkg.temporarySalePrice ?? pkg.salePrice) }}</strong>
          </div>
          <div class="info-card">
            <span>福利价</span>
            <strong>{{ formatMoney(pkg.welfarePrice ?? undefined) }}</strong>
          </div>
          <div class="info-card">
            <span>库存标记</span>
            <strong>{{ analysis.inventoryFlagLabel ?? '正常' }}</strong>
          </div>
          <div class="info-card">
            <span>销售判断</span>
            <strong>{{ analysis.inventorySalesLabel ?? '观察中' }}</strong>
          </div>
          <div class="info-card">
            <span>最近库存</span>
            <strong>{{ formatInventoryTrend(analysis.inventoryTrend) }}</strong>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>评分拆解</h2>
        </div>
        <ChartPanel :option="scoreOption" />
      </section>
    </div>

    <section v-if="pkg" class="panel">
      <div class="panel-head">
        <h2>异常预警与下一步动作</h2>
        <el-button type="primary" @click="$router.push({ path: '/generate', query: { packageId, mode: 'battle-card' } })">生成作战卡</el-button>
      </div>
      <el-table :data="analysis.operationAlerts ?? []" height="220" empty-text="暂无预警">
        <el-table-column prop="title" label="预警" width="140" />
        <el-table-column prop="reason" label="原因" min-width="240" show-overflow-tooltip />
        <el-table-column prop="action" label="动作" min-width="280" show-overflow-tooltip />
      </el-table>
    </section>

    <section v-if="pkg" class="panel package-long-panel">
      <div class="panel-head">
        <h2>卖点与限制</h2>
        <el-button type="primary" @click="$router.push({ path: '/generate', query: { packageId } })">生成文案</el-button>
      </div>
      <div class="detail-columns">
        <div class="detail-block">
          <h3>卖点</h3>
          <ul>
            <li v-for="point in pkg.sellingPoints ?? []" :key="point">{{ point }}</li>
            <li v-if="!pkg.sellingPoints?.length" class="muted-cell">暂无卖点</li>
          </ul>
        </div>
        <div class="detail-block">
          <h3>使用限制</h3>
          <ul>
            <li v-for="rule in pkg.useRules ?? []" :key="rule">{{ rule }}</li>
            <li v-if="!pkg.useRules?.length" class="muted-cell">暂无限制</li>
          </ul>
        </div>
        <div class="detail-block detail-summary">
          <h3>套餐详情</h3>
          <p>{{ pkg.detailSummary || '暂无套餐详情摘要' }}</p>
        </div>
      </div>
    </section>

    <section v-if="pkg" class="panel">
      <div class="panel-head">
        <h2>可生成文案角度</h2>
      </div>
      <div class="tag-cloud">
        <el-tag v-for="angle in analysis.recommendation?.copyAngles ?? []" :key="angle" size="large">{{ angle }}</el-tag>
        <el-tag v-for="tip in analysis.recommendation?.riskTips ?? []" :key="tip" type="warning" size="large">{{ tip }}</el-tag>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import type { ContentPackage } from '@content/shared';
import ChartPanel from '../components/ChartPanel.vue';
import { api, type PackageAnalysisResponse } from '../services/api';
import { statusLabels, inventoryTagType, salesTagType, operationTagType, formatMoney } from '../utils/labels';

const props = defineProps<{ packageId: string }>();
const router = useRouter();
const loading = ref(false);
const analysis = ref<PackageAnalysisResponse>({} as PackageAnalysisResponse);
const pkg = computed<ContentPackage | undefined>(() => analysis.value.package);

const formatInventoryTrend = (trend: Array<{ remainingStock: number }> | undefined) =>
  (trend ?? []).map((point) => point.remainingStock).join(' -> ') || '-';

// inventoryTagType, salesTagType, operationTagType 已从 utils/labels.ts 导入

const goBack = () => {
  router.push('/recommendations');
};

const trendOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 36, right: 18, top: 26, bottom: 32 },
  xAxis: { type: 'category', data: (analysis.value.trends ?? []).map((item) => item.label) },
  yAxis: { type: 'value' },
  series: [
    {
      type: 'bar',
      data: (analysis.value.trends ?? []).map((item) => item.value),
      itemStyle: { color: '#2f6f73' }
    }
  ]
}));

const scoreOption = computed(() => {
  const dimensions = analysis.value.scoreBreakdown?.dimensions ?? [];
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 78, right: 18, top: 20, bottom: 26 },
    xAxis: { type: 'value', max: 100 },
    yAxis: { type: 'category', data: dimensions.map((item) => item.label) },
    series: [
      {
        type: 'bar',
        data: dimensions.map((item) => Math.round(item.score)),
        itemStyle: { color: '#2f6f73' },
        label: { show: true, position: 'right' }
      }
    ]
  };
});

// operationTagType 已从 utils/labels.ts 导入

const load = async () => {
  loading.value = true;
  try {
    analysis.value = await api.getPackageAnalysis(props.packageId);
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.package-analysis-page {
  overflow-x: hidden;
}

.analysis-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.analysis-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(260px, 0.9fr);
  gap: 18px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.info-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f8fafc;
}

.info-card span {
  display: block;
  color: var(--muted);
  font-size: 12px;
}

.info-card strong {
  display: block;
  margin-top: 6px;
  color: var(--ink);
  font-size: 15px;
  line-height: 1.5;
  word-break: break-word;
}

.score-block small {
  color: var(--muted);
}

.package-long-panel {
  min-width: 0;
}

.detail-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.detail-block {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f8fafc;
}

.detail-block h3 {
  margin: 0 0 10px;
  font-size: 15px;
}

.detail-block ul {
  display: grid;
  gap: 8px;
  padding-left: 18px;
  margin: 0;
}

.detail-block li,
.detail-summary p {
  color: var(--ink-soft);
  line-height: 1.7;
  word-break: break-word;
}

.detail-summary p {
  margin: 0;
}

.muted-cell {
  color: var(--muted);
}

@media (max-width: 980px) {
  .analysis-content-grid,
  .info-grid,
  .detail-columns {
    grid-template-columns: 1fr;
  }
}
</style>
