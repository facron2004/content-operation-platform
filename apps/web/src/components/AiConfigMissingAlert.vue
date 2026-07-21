<script setup lang="ts">
import type { AICopyStatus } from '../services/api';
defineProps<{ aiStatus: AICopyStatus | null }>();
</script>
<template>
  <el-alert
    v-if="aiStatus && !aiStatus.enabled"
    type="warning"
    :closable="false"
    show-icon
    title="AI接口未配置"
    :description="`缺少 ${aiStatus.missing.join('、')}，配置后即可调用兼容接口生成。`"
  />
</template>
