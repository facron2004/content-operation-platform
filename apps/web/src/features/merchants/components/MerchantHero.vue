<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
defineProps<{ loading: boolean }>();
defineEmits<{ reload: [] }>();
</script>
<template>
  <header class="merchant-hero panel">
    <div>
      <p class="eyebrow">数据中台 / 商家分析</p>
      <h2><slot name="title">商家清单</slot></h2>
      <p class="hero-description">
        按 stale_30d 占比与 30 天 GMV 排序商家；点击进入单商家画像看趋势、SKU 分布、竞品对比。
      </p>
    </div>
    <div class="hero-meta">
      <AppleButton size="sm" variant="secondary" :loading="loading" @click="$emit('reload')">
        刷新
      </AppleButton>
    </div>
  </header>
</template>
