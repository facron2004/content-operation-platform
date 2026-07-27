<template>
  <div v-if="showTimestamp && relativeTime" class="cache-timestamp">
    <el-icon :color="freshnessColor"><Clock /></el-icon>
    <span class="timestamp-text" :style="{ color: freshnessColor }">
      {{ freshnessText }} · 更新于 {{ relativeTime }}
    </span>
    <AppleButton v-if="showRefresh" size="sm" variant="quiet" @click="$emit('refresh')">
      <template #icon>
        <el-icon><Refresh /></el-icon>
      </template>
      刷新
    </AppleButton>
  </div>
</template>
<script setup lang="ts">
import { Clock, Refresh } from '@element-plus/icons-vue';
import AppleButton from './AppleButton.vue';
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
