<template>
  <div v-if="filteredRecords.length === 0" class="history-empty">
    <el-empty description="暂无操作记录" :image-size="72" />
  </div>
  <div v-else class="history-list">
    <button
      v-for="row in filteredRecords"
      :key="row.id"
      type="button"
      class="history-item"
      :class="{ 'is-error': row.result === 'error' }"
      @click="$emit('show-details', row)"
    >
      <div class="history-item-icon" :class="row.result === 'success' ? 'is-success' : 'is-error'">
        <el-icon v-if="row.result === 'success'"><SuccessFilled /></el-icon>
        <el-icon v-else><CircleCloseFilled /></el-icon>
      </div>
      <div class="history-item-body">
        <div class="history-item-title-row">
          <span class="history-item-action">{{ row.action }}</span>
          <el-tag size="small" effect="plain" class="history-type-tag">
            {{ getTypeLabel(row.type) }}
          </el-tag>
        </div>
        <div class="history-item-meta">
          <span class="history-item-time">{{ formatTime(row.timestamp) }}</span>
          <span class="history-item-result" :data-result="row.result">
            {{ row.result === 'success' ? '成功' : '失败' }}
          </span>
        </div>
        <div v-if="row.error" class="history-item-error">{{ row.error }}</div>
      </div>
      <el-icon class="history-item-chevron"><ArrowRight /></el-icon>
    </button>
  </div>
</template>
<script setup lang="ts">
import { ArrowRight, CircleCloseFilled, SuccessFilled } from '@element-plus/icons-vue';
import type { OperationRecord } from '../services/operation-history';
defineProps<{
  filteredRecords: OperationRecord[];
  formatTime: (t: number) => string;
  getTypeLabel: (type: OperationRecord['type']) => string;
}>();
defineEmits<{ 'show-details': [row: OperationRecord] }>();
</script>
