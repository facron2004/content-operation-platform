<script setup lang="ts">
defineProps<{
  steps: Array<{
    key: string;
    index: number | string;
    label: string;
    description: string;
    state?: string;
  }>;
}>();
</script>
<template>
  <section class="workflow-strip panel">
    <div class="workflow-copy">
      <h3>当前流程</h3>
      <p>把套餐信息、AI 配置和结果输出放在一条链路里，减少来回切换。</p>
    </div>
    <div class="workflow-steps">
      <div v-for="step in steps" :key="step.key" class="workflow-step" :class="step.state">
        <span>{{ step.index }}</span>
        <strong>{{ step.label }}</strong>
        <small>{{ step.description }}</small>
      </div>
    </div>
  </section>
</template>
