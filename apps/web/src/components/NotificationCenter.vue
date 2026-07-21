<script setup lang="ts">
import { Bell } from '@element-plus/icons-vue';
import NotificationList from './NotificationList.vue';
import { useNotificationCenter } from '../composables/useNotificationCenter';
const { visible, notifications, unreadCount, markAllAsRead, remove, handleClick, clearAll } =
  useNotificationCenter();
</script>
<template>
  <el-badge :value="unreadCount" :hidden="unreadCount === 0" class="notification-badge">
    <el-button :icon="Bell" circle class="notification-trigger" @click="visible = true" />
  </el-badge>
  <el-drawer v-model="visible" title="通知中心" size="400px" direction="rtl">
    <div class="notification-header">
      <div>
        <strong>运营提醒</strong>
        <p>实时查看系统事件、预警和任务结果。</p>
      </div>
      <div class="notification-actions">
        <el-button size="small" text @click="markAllAsRead">全部已读</el-button>
        <el-button size="small" text type="danger" @click="clearAll">清空全部</el-button>
      </div>
    </div>
    <NotificationList :notifications="notifications" @click="handleClick" @remove="remove" />
  </el-drawer>
</template>
<style src="../styles/components/notification-center.css" scoped></style>
