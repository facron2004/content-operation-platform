<template>
  <div class="defaults-box">
    <div v-for="(value, key) in defaults" :key="key" class="defaults-item">
      <strong>{{ ruleTypeLabels[key] ?? key }}</strong>
      <pre>{{ pretty(value) }}</pre>
    </div>
  </div>
</template>
<script setup lang="ts">
defineProps<{
  defaults: Record<string, unknown>;
  ruleTypeLabels: Record<string, string>;
  pretty: (value: unknown) => string;
}>();
</script>
