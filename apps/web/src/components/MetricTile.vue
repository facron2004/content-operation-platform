<template>
  <div
    class="metric-tile"
    :class="{ danger, info, clickable }"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    @keydown.enter="$emit('activate')"
    @keydown.space.prevent="$emit('activate')"
    @click="clickable ? $emit('activate') : undefined"
  >
    <span>{{ label }}</span>
    <strong>{{ value }}</strong>
    <em v-if="hint" class="metric-hint">{{ hint }}</em>
    <small v-if="delta" class="metric-delta" :class="deltaToneClass">{{ delta }}</small>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{
  label: string;
  value: string | number;
  danger?: boolean;
  info?: boolean;
  hint?: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'flat';
  clickable?: boolean;
}>();
defineEmits<{ activate: [] }>();
const deltaToneClass = computed(() =>
  props.deltaTone === 'up' ? 'tone-up' : props.deltaTone === 'down' ? 'tone-down' : 'tone-flat'
);
</script>
<style src="../styles/components/metric-tile.css" scoped></style>
