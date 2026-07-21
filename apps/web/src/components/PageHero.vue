<template>
  <section class="page-hero">
    <div>
      <p class="eyebrow">{{ eyebrow }}</p>
      <h2>{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
    </div>
    <slot name="actions">
      <el-button type="primary" :loading="loading" @click="$emit('refresh')">
        {{ actionText }}
      </el-button>
    </slot>
  </section>
</template>
<script setup lang="ts">
defineProps<{
  eyebrow: string;
  title: string;
  description?: string;
  loading?: boolean;
  actionText?: string;
}>();
defineEmits<{ refresh: [] }>();
</script>
<style src="../styles/components/page-hero.css" scoped></style>
