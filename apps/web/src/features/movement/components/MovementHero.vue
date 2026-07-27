<template>
  <header class="mv-hero panel">
    <div>
      <p class="eyebrow">{{ today?.date || todayText }} / 数据中台 动销</p>
      <h2>动销 / 不动销清单</h2>
      <p class="hero-description">有库存 SKU 的动销 / 不动销阶梯，一行下钻分析。</p>
    </div>
    <div class="hero-meta">
      <!-- Residual #227: as-of business day (getMovementToday already accepts date). -->
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
      <span class="updated-at">更新 {{ formatTime(today?.updatedAt) }}</span>
      <AppleButton variant="secondary" size="sm" :loading="loading" @click="$emit('reload')">
        刷新
      </AppleButton>
    </div>
  </header>
</template>
<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
import { formatTime } from '../../../utils/labels';
const props = defineProps<{
  loading: boolean;
  todayText: string;
  kpiDate: string;
  today: { date?: string; updatedAt?: string } | null;
}>();
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
