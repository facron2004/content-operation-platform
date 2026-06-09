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

<style scoped>
.page-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
}

.page-hero h2 {
  margin: 0;
  font-size: 26px;
}

.page-hero p:not(.eyebrow) {
  margin: 8px 0 0;
  color: var(--muted);
}
</style>
