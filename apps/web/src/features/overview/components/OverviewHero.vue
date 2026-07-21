<template>
  <header class="overview-hero panel">
    <div>
      <p class="eyebrow">{{ dateLabel }} / 数据中台总览</p>
      <h2>今日数据中台</h2>
      <p class="hero-description">商家盘子 · 动销 · 零动销分布；点卡片可下钻。</p>
    </div>
    <div class="hero-meta">
      <el-tag size="small" effect="plain" type="info">{{ dataSource || '数据源加载中' }}</el-tag>
      <span class="updated-at">更新 {{ updatedAtLabel }}</span>
      <el-button size="small" :loading="loading" @click="$emit('reload')">刷新</el-button>
    </div>
  </header>
</template>
<script setup lang="ts">
defineProps<{
  dateLabel: string;
  dataSource?: string | null;
  updatedAtLabel: string;
  loading: boolean;
}>();
defineEmits<{ reload: [] }>();
</script>
