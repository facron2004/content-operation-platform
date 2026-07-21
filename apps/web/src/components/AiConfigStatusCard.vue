<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import type { AICopyStatus } from '../services/api';
defineProps<{ aiStatus: AICopyStatus | null }>();
defineEmits<{ refresh: [] }>();
</script>
<template>
  <div class="ai-status-card" :class="{ offline: aiStatus && !aiStatus.enabled }">
    <div>
      <strong>{{ aiStatus?.providerName ?? '读取中' }}</strong>
      <span>{{ aiStatus?.model ?? '-' }}</span>
      <small>{{ aiStatus?.baseURL ?? '-' }}</small>
      <small>Key：{{ aiStatus?.maskedApiKey ?? '未配置' }}</small>
    </div>
    <el-button size="small" :icon="Refresh" @click="$emit('refresh')">刷新</el-button>
  </div>
</template>
