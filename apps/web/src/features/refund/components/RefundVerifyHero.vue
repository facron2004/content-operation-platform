<script setup lang="ts">
defineProps<{ loading: boolean }>();
defineEmits<{ reload: [] }>();
</script>
<template>
  <header class="rv-hero panel">
    <div>
      <p class="eyebrow">数据中台 / 退款 · 核销</p>
      <h2>退款 / 核销分析</h2>
      <p class="hero-description">追踪订单退款率与核销率走势,识别高退款商家,保障 GMV 真正入账。</p>
    </div>
    <div class="hero-meta">
      <el-button size="small" :loading="loading" @click="$emit('reload')">刷新</el-button>
    </div>
  </header>
</template>
