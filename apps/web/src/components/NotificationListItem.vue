<template>
  <div
    :class="['notification-item', { unread: !notification.read }]"
    @click="$emit('click', notification)"
  >
    <div class="notification-icon" :class="`type-${notification.type}`">
      <el-icon v-if="notification.type === 'success'"><SuccessFilled /></el-icon>
      <el-icon v-else-if="notification.type === 'warning'"><WarningFilled /></el-icon>
      <el-icon v-else-if="notification.type === 'alert'"><CircleCloseFilled /></el-icon>
      <el-icon v-else><InfoFilled /></el-icon>
    </div>
    <div class="notification-content">
      <div class="notification-title-row">
        <div class="notification-title">{{ notification.title }}</div>
        <span v-if="!notification.read" class="unread-dot" />
      </div>
      <div class="notification-message">{{ notification.message }}</div>
      <div class="notification-time">{{ formatNotificationTime(notification.timestamp) }}</div>
    </div>
    <AppleButton
      size="sm"
      icon-only
      variant="quiet"
      class="remove-button"
      @click.stop="$emit('remove', notification.id)"
    >
      <template #icon>
        <el-icon><Close /></el-icon>
      </template>
    </AppleButton>
  </div>
</template>
<script setup lang="ts">
import {
  SuccessFilled,
  WarningFilled,
  CircleCloseFilled,
  InfoFilled,
  Close
} from '@element-plus/icons-vue';
import type { Notification } from '../services/notification.service';
import { formatNotificationTime } from './notification-helpers';
import AppleButton from './AppleButton.vue';
defineProps<{ notification: Notification }>();
defineEmits<{ click: [notification: Notification]; remove: [id: string] }>();
</script>
