<script setup lang="ts">
defineProps<{ packageName?: string; modeLabel: string; copyCount: number }>();
</script>
<template>
  <section class="generate-hero panel">
    <div class="hero-copy-block">
      <p class="eyebrow">AI Content Studio</p>
      <h2>作战卡与文案生成中心</h2>
      <p class="hero-copy">
        先选套餐，再看喂给 AI 的信息，最后输出可直接审核和分发的作战卡与文案。
      </p>
    </div>
    <div class="hero-actions">
      <div class="hero-chip">
        <span>当前套餐</span>
        <strong>{{ packageName || '未选择' }}</strong>
      </div>
      <div class="hero-chip">
        <span>生成模式</span>
        <strong>{{ modeLabel }}</strong>
      </div>
      <div class="hero-chip hero-chip-accent">
        <span>结果</span>
        <strong>{{ copyCount }} 条文案</strong>
      </div>
    </div>
  </section>
</template>
