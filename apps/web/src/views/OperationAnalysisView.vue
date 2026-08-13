<template>
  <section v-loading="loading" class="page-stack operation-analysis-page">
    <div class="page-toolbar">
      <AppleDatePicker
        :model-value="kpiDate"
        placeholder="选择经营日"
        :disabled-date="disableFutureDate"
        @update:model-value="onDateChange"
      />
      <AppleButton variant="secondary" size="sm" :loading="loading" @click="reload(true)">
        重新加载本地数据
      </AppleButton>
    </div>

    <ErrorAlert :message="loadError" />

    <div class="analysis-kpi-grid">
      <article class="analysis-kpi-card analysis-kpi-card--primary">
        <span>经营日净 GMV</span>
        <strong>{{ totalGmvDisplay }}</strong>
        <small>{{ kpi?.dataSource || '等待数据' }}</small>
      </article>
      <article class="analysis-kpi-card">
        <span>支付订单</span>
        <strong>{{ kpi?.paidOrderCount?.toLocaleString('zh-CN') || '—' }}</strong>
        <small>按 paidTime 口径</small>
      </article>
      <article class="analysis-kpi-card">
        <span>退款率</span>
        <strong>{{ kpi ? `${(kpi.refundRate * 100).toFixed(2)}%` : '—' }}</strong>
        <small>退款单 / 支付单</small>
      </article>
      <article class="analysis-kpi-card">
        <span>核销率</span>
        <strong>{{ kpi ? `${(kpi.verifyRate * 100).toFixed(2)}%` : '—' }}</strong>
        <small>核销单 / 支付单</small>
      </article>
    </div>

    <section class="analysis-panel analysis-trend-panel">
      <header class="analysis-panel-header">
        <div>
          <h2>净 GMV 动销趋势</h2>
          <p>最近 30 个经营日，以所选日期为截止日；金额统一按净 GMV 口径展示。</p>
        </div>
        <span class="analysis-latest">最近一天 {{ latestGmvDisplay }}</span>
      </header>
      <ChartPanel :option="trendOption" />
    </section>

    <section class="analysis-panel">
      <header class="analysis-panel-header analysis-dimension-header">
        <div>
          <h2>{{ dimensionTitle }}</h2>
          <p>{{ dimensionLabel }}是同一个分析页中的可切换维度；占比按平台净 GMV 计算。</p>
        </div>
        <el-radio-group
          :model-value="dimension"
          size="small"
          @change="onDimensionChange($event as 'area' | 'category')"
        >
          <el-radio-button value="area">区域</el-radio-button>
          <el-radio-button value="category">类目</el-radio-button>
        </el-radio-group>
      </header>

      <div class="analysis-insight-strip">
        <div>
          <span>主导{{ dimensionLabel }}</span>
          <strong>{{ topDimension?.key || '—' }}</strong>
        </div>
        <div>
          <span>主导占比</span>
          <strong>{{ topDimensionShare }}</strong>
        </div>
        <div>
          <span>当前展示占比</span>
          <strong>{{ visibleShare }}</strong>
        </div>
        <div>
          <span>数据范围</span>
          <strong>
            {{ distributionMatched ?? distribution.length }} 个{{ dimensionLabel }}
            <em v-if="distributionTruncated">（Top {{ distributionLimit }}）</em>
          </strong>
        </div>
      </div>

      <el-table v-if="distribution.length" :data="distribution" stripe class="analysis-table">
        <el-table-column type="index" label="#" width="64" />
        <el-table-column prop="key" :label="dimensionLabel" min-width="180" />
        <el-table-column label="净 GMV" min-width="160" align="right">
          <template #default="{ row }">{{ displayMoney(row, 'totalGmv') }}</template>
        </el-table-column>
        <el-table-column label="平台占比" min-width="130" align="right">
          <template #default="{ row }">{{ formatPercent(row.share) }}</template>
        </el-table-column>
        <el-table-column label="现金支付" min-width="150" align="right">
          <template #default="{ row }">{{ displayMoney(row, 'gmvOnline') }}</template>
        </el-table-column>
        <el-table-column label="余额支付" min-width="150" align="right">
          <template #default="{ row }">{{ displayMoney(row, 'gmvWallet') }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="当前经营日暂无维度数据" />
    </section>
  </section>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import AppleButton from '../components/AppleButton.vue';
import ChartPanel from '../components/ChartPanel.vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import AppleDatePicker from '../features/gmv/components/AppleDatePicker.vue';
import { displayMoney, formatPercent } from '../utils/format';
import { useOperationAnalysis } from '../features/operation-analysis/useOperationAnalysis';

const route = useRoute();
const {
  kpiDate,
  dimension,
  dimensionLabel,
  dimensionTitle,
  loading,
  loadError,
  kpi,
  distribution,
  distributionLimit,
  distributionMatched,
  distributionTruncated,
  trendOption,
  totalGmvDisplay,
  latestGmvDisplay,
  topDimension,
  topDimensionShare,
  visibleShare,
  onDimensionChange,
  onDateChange,
  disableFutureDate,
  reload
} = useOperationAnalysis(route);
</script>

<style src="../styles/views/operation-analysis.css" scoped></style>
