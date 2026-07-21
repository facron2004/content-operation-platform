<template>
  <div class="section-header-card">
    <div class="section-copy">
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <h2>{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
    </div>
    <div class="section-actions"><slot name="actions" /></div>
  </div>
</template>
<script setup lang="ts">
defineProps<{ eyebrow?: string; title: string; description?: string }>();
</script>
<style src="../styles/components/section-header.css" scoped></style>
