<template>
  <section class="panel table-panel">
    <div class="panel-head">
      <div>
        <h2>推广效果明细</h2>
        <p>按文案、版本和渠道查看具体表现。</p>
      </div>
    </div>
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
defineProps<{ items: PerformanceResponse['items'] }>();
</script>
