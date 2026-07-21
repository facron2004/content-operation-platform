<template>
  <div v-if="showTimestamp && relativeTime" class="cache-timestamp">
    <el-icon :color="freshnessColor"><Clock /></el-icon>
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
defineEmits<{ refresh: [] }>();
</script>
<style src="../styles/components/cache-timestamp.css" scoped></style>
