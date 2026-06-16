<template>
  <div class="metric-tile" :class="{ danger, info }">
    <span>{{ label }}</span>
    <strong>{{ value }}</strong>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  danger?: boolean;
  info?: boolean;
}>();
</script>
