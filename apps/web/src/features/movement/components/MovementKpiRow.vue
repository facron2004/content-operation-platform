<template>
  <div class="mv-kpi-grid">
    <article class="mv-kpi-card">
      <div>
        <span>活跃 SKU</span>
        <strong>{{ today?.activeSkus ?? '-' }}</strong>
        <p>当前有库存的套餐数</p>
      </div>
      <el-icon class="mv-kpi-icon is-blue"><Box /></el-icon>
    </article>
    <article class="mv-kpi-card is-info">
      <div>
        <span>今日动销</span>
        <strong>{{ today?.movingSkus ?? '-' }}</strong>
        <p>今日有销量的 SKU</p>
      </div>
      <el-icon class="mv-kpi-icon is-blue"><TrendCharts /></el-icon>
    </article>
    <article class="mv-kpi-card is-danger">
      <div>
        <span>不动销 SKU</span>
        <strong>{{ today?.stagnantSkus ?? '-' }}</strong>
        <p>有库存且近期无销</p>
      </div>
      <el-icon class="mv-kpi-icon is-red"><Warning /></el-icon>
    </article>
    <article class="mv-kpi-card">
      <div>
        <span>动销率</span>
        <strong>{{ formatPercent(today?.movingRate) }}</strong>
        <p>
          {{ today ? `动销 ${today.movingSkus ?? 0} / 活跃 ${today.activeSkus ?? 0}` : '动销效率' }}
        </p>
      </div>
      <el-icon class="mv-kpi-icon is-green"><PieChart /></el-icon>
    </article>
  </div>
</template>
<script setup lang="ts">
import { Box, PieChart, TrendCharts, Warning } from '@element-plus/icons-vue';
import { formatPercent } from '../../../utils/format';
defineProps<{
  today: {
    activeSkus?: number;
    movingSkus?: number;
    stagnantSkus?: number;
    movingRate?: number;
  } | null;
}>();
</script>
