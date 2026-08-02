<script setup lang="ts">
import { Bell } from '@element-plus/icons-vue';
import NotificationList from './NotificationList.vue';
import AppleButton from './AppleButton.vue';
import { useNotificationCenter } from '../composables/useNotificationCenter';
const { visible, notifications, unreadCount, markAllAsRead, remove, handleClick, clearAll } =
  useNotificationCenter();
</script>
<template>
  <el-badge :value="unreadCount" :hidden="unreadCount === 0" class="notification-badge">
    <AppleButton icon-only variant="secondary" class="notification-trigger" @click="visible = true">
      <template #icon>
        <el-icon><Bell /></el-icon>
      </template>
    </AppleButton>
  </el-badge>
  <el-drawer v-model="visible" title="通知中心" size="400px" direction="rtl" append-to-body>
    <div class="notification-header">
      <div>
        <strong>运营提醒</strong>
        <p>实时查看系统事件、预警和任务结果。</p>
      </div>
      <div class="notification-actions">
        <AppleButton size="sm" variant="quiet" @click="markAllAsRead">全部已读</AppleButton>
        <AppleButton size="sm" variant="ghost" data-tone="danger" @click="clearAll">
          清空全部
        </AppleButton>
      </div>
    </div>
    <NotificationList :notifications="notifications" @click="handleClick" @remove="remove" />
  </el-drawer>
</template>
<style src="../styles/components/notification-center.css" scoped></style>
