<template>
  <header class="overview-hero panel">
    <div>
      <p class="eyebrow">{{ dateLabel }} / 数据中台总览</p>
      <h2>今日数据中台</h2>
      <p class="hero-description">商家盘子 · 动销 · 零动销分布；点卡片可下钻。</p>
    </div>
    <div class="hero-meta">
      <!-- Residual #224: as-of business day (OverviewKpiQueryDto.date / getOverviewKpis(date)). -->
      <div class="hero-controls">
        <span class="control-label">业务日</span>
        <el-date-picker
          :model-value="kpiDate || undefined"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="业务日"
          :clearable="false"
          style="width: 150px"
          @update:model-value="onDateUpdate"
        />
      </div>
      <span class="apple-meta-pill">{{ dataSource || '数据源加载中' }}</span>
      <span class="updated-at">更新 {{ updatedAtLabel }}</span>
      <AppleButton variant="secondary" size="sm" :loading="loading" @click="$emit('reload')">
        刷新
      </AppleButton>
    </div>
  </header>
</template>
<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
const props = defineProps<{
  dateLabel: string;
  kpiDate: string;
  dataSource?: string | null;
  updatedAtLabel: string;
  loading: boolean;
}>();
const emit = defineEmits<{
  reload: [];
  'update:kpiDate': [value: string];
  'date-change': [];
}>();

function onDateUpdate(value: string | null | undefined) {
  const next = value ? String(value) : props.kpiDate;
  if (next === props.kpiDate) return;
  emit('update:kpiDate', next);
  emit('date-change');
}
</script>

<style scoped>
.hero-controls {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.control-label {
  font-size: 12px;
  color: #6e6e73;
  font-weight: 500;
}
.apple-meta-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(120, 120, 128, 0.12);
  color: #3a3a3c;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -0.01em;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
}
</style>
