<script setup lang="ts">
import type { DataAnalysisSummary } from '../../../services/api/data-analysis.api';
import type { DataAnalysisPreset } from '../composables/useDataAnalysisPage';
import DataAnalysisWindowBar from './DataAnalysisWindowBar.vue';
import DataAnalysisKpiRow from './DataAnalysisKpiRow.vue';
import DataAnalysisMidRow from './DataAnalysisMidRow.vue';
import DataAnalysisBottomRow from './DataAnalysisBottomRow.vue';
import DataAnalysisRankTable from './DataAnalysisRankTable.vue';
import DataAnalysisVerifyPanel from './DataAnalysisVerifyPanel.vue';
import DataAnalysisRefundPanel from './DataAnalysisRefundPanel.vue';

const preset = defineModel<DataAnalysisPreset>('preset', { required: true });

defineProps<{
  summary: DataAnalysisSummary | null;
  presetLabels: Record<DataAnalysisPreset, string>;
  customStart: string;
  customEnd: string;
  windowRange: string;
  loading: boolean;
  dailyTrendOption: Record<string, unknown>;
  channelOption: Record<string, unknown>;
}>();

defineEmits<{
  'preset-change': [value: DataAnalysisPreset];
  'range-change': [value: [string, string] | null];
}>();
</script>

<template>
  <DataAnalysisWindowBar
    v-model:preset="preset"
    :preset-labels="presetLabels"
    :custom-start="customStart"
    :custom-end="customEnd"
    :window-range="windowRange"
    :loading="loading"
    @preset-change="$emit('preset-change', $event)"
    @range-change="$emit('range-change', $event)"
  />

  <DataAnalysisKpiRow :overview="summary?.overview ?? null" :deltas="summary?.deltas ?? null" />

  <template v-if="summary">
    <DataAnalysisMidRow
      :daily-trend-option="dailyTrendOption"
      :channel-option="channelOption"
      :channels="summary.channels ?? []"
      :overview="summary.overview"
      :deltas="summary.deltas"
    />

    <DataAnalysisBottomRow
      :snapshots="summary.windowSnapshots ?? []"
      :deltas="summary.deltas"
      :packages="summary.packages ?? []"
      :package-limit="summary.packageLimit"
      :package-truncated="summary.packageTruncated === true"
    />

    <!-- Residual #279: panel-cap honesty banners (interactive Top-N is not exhaustive). -->
    <p v-if="summary.rankingTruncated" class="list-cap-hint">
      排行预览仅展示前 {{ summary.rankingLimit ?? 20 }} 名业务员/商家（全量请导出 Excel）。
    </p>
    <p v-if="summary.refundTruncated" class="list-cap-hint">
      退款预览仅展示前 {{ summary.refundLimit ?? 15 }} 名（全量请导出 Excel）。
    </p>
    <p v-if="summary.packageTruncated" class="list-cap-hint">
      热门商品预览仅展示前 {{ summary.packageLimit ?? 5 }} 个（全量请导出 Excel）。
    </p>

    <div class="da-rank-row">
      <DataAnalysisRankTable
        title="业务员销售额排行"
        name-label="业务员"
        :rows="summary.salesmen ?? []"
        :cap-limit="summary.rankingLimit"
        :cap-truncated="summary.rankingTruncated === true"
        empty-hint="业务员字段暂无数据：可跑订单 ETL 或 scripts/backfill-order-salesman.ts 回填。"
      />
      <DataAnalysisRankTable
        title="商家销售额排行"
        name-label="商家"
        :rows="summary.merchants ?? []"
        :cap-limit="summary.rankingLimit"
        :cap-truncated="summary.rankingTruncated === true"
      />
    </div>

    <DataAnalysisVerifyPanel
      :merchant-low="summary.merchantVerifyLow ?? []"
      :merchant-high="summary.merchantVerifyHigh ?? []"
      :salesman-low="summary.salesmanVerifyLow ?? []"
      :salesman-high="summary.salesmanVerifyHigh ?? []"
    />

    <DataAnalysisRefundPanel
      :merchant-refunds="summary.merchantRefunds ?? []"
      :salesman-refunds="summary.salesmanRefunds ?? []"
      :cap-limit="summary.refundLimit"
      :cap-truncated="summary.refundTruncated === true"
    />

    <section v-if="summary.limitations?.length" class="panel da-notes">
      <header>
        <h3>口径说明</h3>
        <span v-if="summary.detailTruncated" class="da-pill da-pill--warn">
          明细导出将截断至 {{ summary.detailCount }} 行
        </span>
      </header>
      <ul class="limitations">
        <li v-for="(item, i) in summary.limitations" :key="i">{{ item }}</li>
      </ul>
      <p class="hint">
        导出 Excel 含 7 张工作表（总览 / 时段 / 业务员 / 商家 / 核销 / 退款 /
        明细），与砍价订单模板对齐。
      </p>
    </section>
  </template>

  <div v-else-if="!loading" class="da-empty">
    <span class="da-empty__glyph" aria-hidden="true">📊</span>
    <p>暂无预览数据</p>
  </div>
</template>
