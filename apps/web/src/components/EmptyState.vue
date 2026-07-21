<template>
  <div class="empty-state">
    <div class="empty-icon">{{ icon }}</div>
    <div class="empty-title">{{ title }}</div>
    <div v-if="description" class="empty-description">{{ description }}</div>
    <el-button v-if="actionText" :type="actionType" @click="$emit('action')">
      {{ actionText }}
    </el-button>
  </div>
</template>
<script setup lang="ts">
withDefaults(
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
</script>
<style src="../styles/components/empty-state.css" scoped></style>
