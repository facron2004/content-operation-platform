<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import type { DataAnalysisTimeSlotRow } from '../../../services/api/data-analysis.api';
import { displayMoney, formatNumber, formatPercent } from '../../../utils/format';

defineProps<{
  timeSlots: DataAnalysisTimeSlotRow[];
  timeSlotOption: Record<string, unknown>;
  hourlyOption: Record<string, unknown>;
}>();

const ChartPanel = defineAsyncComponent(() => import('../../../components/ChartPanel.vue'));
</script>

<template>
  <div class="da-charts">
    <section class="panel chart-card">
      <header>
        <h3>时段分布</h3>
        <span class="panel-hint">按支付时间 · 北京时区</span>
      </header>
      <ChartPanel v-if="Object.keys(timeSlotOption).length" :option="timeSlotOption" />
      <div v-else class="da-empty da-empty--compact">
        <p>暂无时段数据</p>
      </div>
      <el-table
        v-if="timeSlots.length"
        :data="timeSlots"
        size="small"
        class="da-inline-table"
        empty-text="—"
      >
        <el-table-column prop="label" label="时段" min-width="110" />
        <el-table-column label="订单数" min-width="80" align="right">
          <template #default="{ row }">{{ formatNumber(row.orderCount, 0) }}</template>
        </el-table-column>
        <el-table-column label="销售额" min-width="100" align="right">
          <template #default="{ row }">{{ displayMoney(row, 'salesAmount') }}</template>
        </el-table-column>
        <el-table-column label="核销数" min-width="80" align="right">
          <template #default="{ row }">{{ formatNumber(row.verifiedCount, 0) }}</template>
        </el-table-column>
        <el-table-column label="核销率" min-width="80" align="right">
          <template #default="{ row }">{{ formatPercent(row.verifyRate) }}</template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel chart-card">
      <header>
        <h3>每小时订单量</h3>
        <span class="panel-hint">0–23 点</span>
      </header>
      <ChartPanel v-if="Object.keys(hourlyOption).length" :option="hourlyOption" />
      <div v-else class="da-empty da-empty--compact">
        <p>暂无小时数据</p>
      </div>
    </section>
  </div>
</template>
