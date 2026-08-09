<template>
  <el-drawer
    v-model="visible"
    :title="drawerTitle"
    size="520px"
    class="movement-timeline-drawer"
    @closed="onClosed"
  >
    <div v-loading="loading" class="timeline-body">
      <ErrorAlert :message="error" />
      <div class="timeline-meta">
        <span v-if="merchantName" class="meta-item">商家：{{ merchantName }}</span>
        <!-- Residual #234: operator-selectable window (API days 7–90). -->
        <div class="day-options" role="group" aria-label="时间线窗口">
          <button
            v-for="opt in dayOptions"
            :key="opt"
            type="button"
            class="day-chip"
            :class="{ active: days === opt }"
            :disabled="loading"
            @click="onDaysChange(opt)"
          >
            {{ opt }} 天
          </button>
        </div>
        <AppleButton
          v-if="packageId"
          variant="ghost"
          size="sm"
          class="meta-action"
          @click="goAnalysis"
        >
          打开分析
        </AppleButton>
      </div>

      <el-table
        :data="timeline"
        size="small"
        stripe
        empty-text="暂无库存/销量时间线"
        style="width: 100%"
        max-height="520"
      >
        <el-table-column prop="date" label="日期" width="110" />
        <el-table-column label="剩余库存" width="100" align="right">
          <template #default="{ row }">{{ formatNumber(row.stockLeft, 0) }}</template>
        </el-table-column>
        <el-table-column label="销量" width="90" align="right">
          <template #default="{ row }">
            <span :class="{ 'sales-positive': Number(row.salesQty) > 0 }">
              {{ formatNumber(row.salesQty, 0) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="来源" min-width="100">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :type="sourceTagType(row.deltaSource)">
              {{ sourceLabel(row.deltaSource) }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { MovementTimelineResponse } from '../../../services/api/movement.api';
import { formatNumber } from '../../../utils/format';
import AppleButton from '../../../components/AppleButton.vue';
import ErrorAlert from '../../../components/ErrorAlert.vue';

type TagType = 'success' | 'primary' | 'warning' | 'info' | 'danger';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    loading?: boolean;
    packageId?: string | null;
    packageName?: string;
    merchantName?: string;
    days?: number;
    timeline?: MovementTimelineResponse['timeline'];
    error?: string | null;
  }>(),
  {
    loading: false,
    packageId: null,
    packageName: '',
    merchantName: '',
    days: 30,
    timeline: () => [],
    error: null
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'closed'): void;
  // Residual #234: parent re-fetches timeline with the selected window.
  (e: 'change-days', days: number): void;
}>();

const router = useRouter();

// Residual #234: match API MovementTimelineQueryDto Min(7) Max(90).
const dayOptions = [7, 14, 30, 60, 90] as const;

function onDaysChange(next: number) {
  if (next === props.days) return;
  emit('change-days', next);
}

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const drawerTitle = computed(() => {
  const name = props.packageName?.trim();
  return name ? `动销时间线 · ${name}` : '动销时间线';
});

function onClosed() {
  emit('closed');
}

function goAnalysis() {
  if (!props.packageId) return;
  router.push({
    name: 'package-analysis',
    params: { packageId: props.packageId },
    query: { from: 'movement-timeline' }
  });
}

function sourceLabel(source?: string): string {
  switch (source) {
    case 'inventory_delta':
      return '库存差分';
    case 'order_header':
      return '订单汇总';
    case 'legacy':
      return '历史';
    case 'no_data':
      return '无数据';
    default:
      return source || '—';
  }
}

function sourceTagType(source?: string): TagType {
  if (source === 'no_data') return 'info';
  if (source === 'legacy') return 'warning';
  if (source === 'inventory_delta' || source === 'order_header') return 'success';
  return 'info';
}
</script>

<style scoped>
.timeline-body {
  min-height: 160px;
}
.timeline-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
  color: var(--el-text-color-secondary, #909399);
  font-size: 13px;
}
.meta-item {
  white-space: nowrap;
}
.meta-action {
  margin-left: auto;
}
/* Residual #234: day-window chips (API 7–90). */
.day-options {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
.day-chip {
  border: 1px solid var(--el-border-color, #dcdfe6);
  background: transparent;
  color: inherit;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
}
.day-chip.active {
  border-color: var(--el-color-primary, #409eff);
  color: var(--el-color-primary, #409eff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}
.day-chip:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.sales-positive {
  color: var(--el-color-success);
  font-weight: 600;
}
</style>
