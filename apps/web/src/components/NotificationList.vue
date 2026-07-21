<template>
  <div v-if="notifications.length === 0" class="empty-notifications">
    <el-empty description="暂无通知" />
  </div>
  <div v-else class="notification-list">
    <NotificationListItem
      v-for="notification in notifications"
      :key="notification.id"
      :notification="notification"
      @click="$emit('click', $event)"
      @remove="$emit('remove', $event)"
    />
  </div>
</template>
<script setup lang="ts">
import type { Notification } from '../services/notification.service';
import NotificationListItem from './NotificationListItem.vue';
defineProps<{ notifications: Notification[] }>();
defineEmits<{ click: [notification: Notification]; remove: [id: string] }>();
</script>
