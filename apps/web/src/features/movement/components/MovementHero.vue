<template>
  <header class="mv-hero panel">
    <div>
      <p class="eyebrow">{{ today?.date || todayText }} / 数据中台 动销</p>
      <h2>动销 / 不动销清单</h2>
      <p class="hero-description">有库存 SKU 的动销 / 不动销阶梯，一行下钻分析。</p>
    </div>
    <div class="hero-meta">
      <span class="updated-at">更新 {{ formatTime(today?.updatedAt) }}</span>
      <el-button size="small" :loading="loading" @click="$emit('reload')">刷新</el-button>
    </div>
  </header>
</template>
<script setup lang="ts">
import { formatTime } from '../../../utils/labels';
defineProps<{
  loading: boolean;
  todayText: string;
  today: { date?: string; updatedAt?: string } | null;
}>();
defineEmits<{ reload: [] }>();
</script>
