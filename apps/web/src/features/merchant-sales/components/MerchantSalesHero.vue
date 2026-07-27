<template>
  <header class="ms-hero panel">
    <div>
      <p class="eyebrow">数据中台 / 商家 · 销售</p>
      <h2>商家销售数据</h2>
      <p class="hero-description">
        按日 / 周 / 月 / 年维度追踪每个商家的销售走势,识别高潜商家与风险商家。
      </p>
    </div>
    <div class="hero-meta">
      <!-- Residual #228: as-of anchor day (API date already applied on summary/ranking/trend). -->
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
      <AppleButton variant="secondary" size="sm" :loading="loading" @click="$emit('reload')">
        刷新
      </AppleButton>
      <AppleButton
        variant="primary"
        size="sm"
        :loading="exporting"
        :disabled="!canExport"
        @click="$emit('export')"
      >
        <template #icon>
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="m7 11 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </template>
        导出 CSV
      </AppleButton>
    </div>
  </header>
</template>
<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
const props = defineProps<{
  loading: boolean;
  exporting: boolean;
  canExport: boolean;
  kpiDate: string;
}>();
const emit = defineEmits<{
  reload: [];
  export: [];
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
