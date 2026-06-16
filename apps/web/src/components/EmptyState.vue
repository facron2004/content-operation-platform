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
interface Props {
  icon?: string;
  title: string;
  description?: string;
  actionText?: string;
  actionType?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
}

withDefaults(defineProps<Props>(), {
  icon: '📭',
  description: '',
  actionText: '',
  actionType: 'primary'
});

defineEmits<{
  action: [];
}>();
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-title {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 8px;
}

.empty-description {
  font-size: 14px;
  color: #909399;
  margin-bottom: 24px;
  max-width: 400px;
}
</style>
