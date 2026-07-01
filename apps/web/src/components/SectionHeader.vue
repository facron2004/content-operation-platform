<template>
  <div class="section-header-card">
    <div class="section-copy">
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <h2>{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
    </div>
    <div class="section-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  eyebrow?: string;
  title: string;
  description?: string;
}>();
</script>

<style scoped>
.section-header-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-copy {
  min-width: 0;
}

.section-copy h2 {
  margin: 0;
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.35;
}

.section-copy p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.section-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 960px) {
  .section-header-card {
    flex-direction: column;
  }

  .section-actions {
    justify-content: flex-start;
  }
}
</style>
