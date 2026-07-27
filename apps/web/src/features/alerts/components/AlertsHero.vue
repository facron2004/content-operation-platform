<template>
  <section class="alerts-hero">
    <div>
      <p class="eyebrow">Risk Control Desk</p>
      <h2>异常预警中心</h2>
      <p>只展示今日未处理预警。处理后会写入本地状态，刷新页面不会再回到待办里。</p>
    </div>
    <div class="hero-actions">
      <div class="hero-chip">
        <span>待处理</span>
        <strong>{{ summary.activeCount }}</strong>
      </div>
      <div class="hero-chip danger-chip">
        <span>高危</span>
        <strong>{{ summary.dangerCount }}</strong>
      </div>
      <AppleButton variant="primary" :loading="loading" @click="$emit('reload')">
        刷新预警
      </AppleButton>
    </div>
  </section>
</template>
<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
defineProps<{ loading: boolean; summary: { activeCount: number; dangerCount: number } }>();
defineEmits<{ reload: [] }>();
</script>
