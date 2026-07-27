<template>
  <section class="panel table-panel">
    <div class="panel-head">
      <div>
        <h2>推广效果明细</h2>
        <p>按文案、版本和渠道查看具体表现。</p>
      </div>
    </div>
    <!-- Residual #284: DASHBOARD_COPY_PERF_TAKE head honesty. -->
    <p v-if="itemsTruncated" class="list-cap-hint">
      效果明细仅加载最近 {{ itemsLimit }} 条推广效果记录（已加载 {{ itemsLoaded }}
      条），版本对比图表同源截断，更早记录未展示。
    </p>
    <!-- Residual #286: DASHBOARD_GENERATED_COPY_TAKE title-join honesty. -->
    <p v-if="titleJoinTruncated || (titleJoinMissed ?? 0) > 0" class="list-cap-hint">
      文案标题/版本仅关联最近 {{ titleJoinLimit }} 条文案（已加载 {{ titleJoinLoaded }} 条
      <template v-if="(titleJoinMissed ?? 0) > 0">
        ，本页 {{ titleJoinMissed }} 条效果记录标题显示为「-」
      </template>
      ），更早文案未参与标题拼接。
    </p>
    <el-table :data="items" height="420" class="result-table">
      <el-table-column prop="title" label="文案" min-width="180" show-overflow-tooltip />
      <el-table-column prop="copyVersion" label="版本" width="72" />
      <el-table-column label="渠道" width="96">
        <template #default="{ row }">{{ channelLabels[row.channel] }}</template>
      </el-table-column>
      <el-table-column prop="clickCount" label="点击" width="72" />
      <el-table-column prop="orderCount" label="下单" width="72" />
      <el-table-column prop="verifyCount" label="核销" width="72" />
      <el-table-column prop="refundCount" label="退款" width="72" />
      <el-table-column prop="gmv" label="GMV" width="90" />
      <el-table-column label="转化率" width="90">
        <template #default="{ row }">{{ formatPercent(row.conversionRate) }}</template>
      </el-table-column>
    </el-table>
  </section>
</template>
<script setup lang="ts">
import type { PerformanceResponse } from '@content/shared';
import { channelLabels, percent as formatPercent } from '../../../utils/labels';
defineProps<{
  items: PerformanceResponse['items'];
  itemsTruncated?: boolean;
  itemsLimit?: number;
  itemsLoaded?: number;
  // Residual #286: DASHBOARD_GENERATED_COPY_TAKE title-join honesty.
  titleJoinTruncated?: boolean;
  titleJoinLimit?: number;
  titleJoinLoaded?: number;
  titleJoinMissed?: number;
}>();
</script>
<style scoped>
.list-cap-hint {
  margin: 0 0 10px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
}
</style>
