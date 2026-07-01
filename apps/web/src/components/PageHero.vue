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
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 28%),
    linear-gradient(180deg, var(--panel) 0%, rgba(251, 252, 254, 0.98) 100%);
  box-shadow: var(--shadow-soft);
}

.page-hero h2 {
  margin: 4px 0 0;
  font-size: 26px;
  font-weight: 800;
  line-height: 1.2;
}

.page-hero p:not(.eyebrow) {
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.6;
}
</style>
