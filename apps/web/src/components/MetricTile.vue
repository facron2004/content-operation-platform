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

<style scoped>
.metric-tile {
  min-height: 76px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  box-shadow: none;
  transition:
    box-shadow 0.16s ease,
    transform 0.16s ease,
    border-color 0.16s ease;
}

.metric-tile:hover {
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}

.metric-tile span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.metric-tile strong {
  display: block;
  margin-top: 4px;
  color: var(--ink);
  font-size: 22px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.metric-tile.danger {
  background: var(--danger-soft);
  border-color: #fecdd3;
}

.metric-tile.info {
  background: var(--accent-soft);
  border-color: var(--accent-line);
}

.metric-tile.info strong {
  color: var(--accent);
}
</style>
