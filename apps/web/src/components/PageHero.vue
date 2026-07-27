<template>
  <section class="page-hero">
    <div>
      <p class="eyebrow">{{ eyebrow }}</p>
      <h2>{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
    </div>
    <slot name="actions">
      <AppleButton variant="primary" :loading="loading" @click="$emit('refresh')">
        {{ actionText }}
      </AppleButton>
    </slot>
  </section>
</template>
<script setup lang="ts">
import AppleButton from './AppleButton.vue';
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
