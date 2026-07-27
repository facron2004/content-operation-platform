<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
const props = defineProps<{ loading: boolean; kpiDate: string }>();
const emit = defineEmits<{
  reload: [];
  'update:kpiDate': [value: string];
  'date-change': [];
}>();

function onDateUpdate(value: string | null | undefined) {
  const next = value ? String(value) : '';
  if (next === props.kpiDate) return;
  emit('update:kpiDate', next);
  emit('date-change');
}
</script>
<template>
  <header class="rv-hero panel">
    <div>
      <p class="eyebrow">数据中台 / 退款 · 核销</p>
      <h2>退款 / 核销分析</h2>
      <p class="hero-description">追踪订单退款率与核销率走势,识别高退款商家,保障 GMV 真正入账。</p>
    </div>
    <div class="hero-meta">
      <!-- Residual #226: as-of business day (getRefundToday/getVerifyToday already accept date). -->
      <div class="hero-controls">
        <span class="control-label">业务日</span>
        <el-date-picker
          :model-value="kpiDate || undefined"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="业务日(默认今天)"
          clearable
          style="width: 170px"
          @update:model-value="onDateUpdate"
        />
      </div>
      <AppleButton size="sm" variant="secondary" :loading="loading" @click="$emit('reload')">
        刷新
      </AppleButton>
    </div>
  </header>
</template>

<style scoped>
.hero-controls {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-right: 8px;
}
.control-label {
  font-size: 12px;
  color: #6e6e73;
  font-weight: 500;
}
</style>
