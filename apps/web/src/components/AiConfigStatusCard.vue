<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import type { AICopyStatus } from '../services/api';
import AppleButton from './AppleButton.vue';
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
    <AppleButton size="sm" variant="secondary" @click="$emit('refresh')">
      <template #icon>
        <el-icon><Refresh /></el-icon>
      </template>
      刷新
    </AppleButton>
  </div>
</template>
