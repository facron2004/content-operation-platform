<template>
  <div class="empty-state">
    <div class="empty-icon">{{ icon }}</div>
    <div class="empty-title">{{ title }}</div>
    <div v-if="description" class="empty-description">{{ description }}</div>
    <AppleButton v-if="actionText" :variant="mappedVariant" @click="$emit('action')">
      {{ actionText }}
    </AppleButton>
    <slot />
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import AppleButton from './AppleButton.vue';

const props = withDefaults(
  defineProps<{
    icon?: string;
    title: string;
    description?: string;
    actionText?: string;
    actionType?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  }>(),
  { icon: '📭', description: '', actionText: '', actionType: 'primary' }
);
defineEmits<{ action: [] }>();

const mappedVariant = computed(() => {
  if (props.actionType === 'info') return 'secondary' as const;
  return props.actionType;
});
</script>
<style src="../styles/components/empty-state.css" scoped></style>
