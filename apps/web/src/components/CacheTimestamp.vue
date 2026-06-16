<template>
  <div v-if="showTimestamp && relativeTime" class="cache-timestamp">
    <el-icon :color="freshnessColor">
      <Clock />
    </el-icon>
    <span class="timestamp-text" :style="{ color: freshnessColor }">
      {{ freshnessText }} · 更新于 {{ relativeTime }}
    </span>
    <el-button v-if="showRefresh" size="small" text @click="$emit('refresh')">
      <el-icon><Refresh /></el-icon>
      刷新
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { Clock, Refresh } from '@element-plus/icons-vue';

defineProps<{
  relativeTime: string;
  freshnessColor: string;
  freshnessText: string;
  showTimestamp?: boolean;
  showRefresh?: boolean;
}>();

defineEmits<{
  refresh: [];
}>();
</script>

<style scoped>
.cache-timestamp {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 6px;
  background: #f5f5f5;
  font-size: 13px;
  color: #666;
}

.timestamp-text {
  font-weight: 500;
}

.cache-timestamp .el-button {
  margin-left: 4px;
}
</style>
