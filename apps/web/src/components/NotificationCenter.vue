<template>
  <el-badge :value="unreadCount" :hidden="unreadCount === 0" class="notification-badge">
    <el-button :icon="Bell" circle @click="visible = true" />
  </el-badge>

  <el-drawer v-model="visible" title="通知中心" size="400px" direction="rtl">
    <div class="notification-header">
      <el-button size="small" text @click="markAllAsRead">全部标记为已读</el-button>
      <el-button size="small" text type="danger" @click="clearAll">清空全部</el-button>
    </div>

    <div v-if="notifications.length === 0" class="empty-notifications">
      <el-empty description="暂无通知" />
    </div>

    <div v-else class="notification-list">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        :class="['notification-item', { unread: !notification.read }]"
        @click="handleClick(notification)"
      >
        <div class="notification-icon">
          <el-icon v-if="notification.type === 'success'" color="#52c41a">
            <SuccessFilled />
          </el-icon>
          <el-icon v-else-if="notification.type === 'warning'" color="#faad14">
            <WarningFilled />
          </el-icon>
          <el-icon v-else-if="notification.type === 'alert'" color="#f5222d">
            <CircleCloseFilled />
          </el-icon>
          <el-icon v-else color="#1890ff"><InfoFilled /></el-icon>
        </div>

        <div class="notification-content">
          <div class="notification-title">{{ notification.title }}</div>
          <div class="notification-message">{{ notification.message }}</div>
          <div class="notification-time">{{ formatTime(notification.timestamp) }}</div>
        </div>

        <el-button size="small" circle text @click.stop="remove(notification.id)">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import {
  Bell,
  SuccessFilled,
  WarningFilled,
  CircleCloseFilled,
  InfoFilled,
  Close
} from '@element-plus/icons-vue';
import { useNotifications, type Notification } from '../services/notification.service';

const router = useRouter();
const visible = ref(false);
const notifications = ref<Notification[]>([]);

const { getAll, markAsRead, markAllAsRead, remove, clear, subscribe } = useNotifications();

const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length);

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}

function handleClick(notification: Notification) {
  markAsRead(notification.id);
  if (notification.actionUrl) {
    router.push(notification.actionUrl);
    visible.value = false;
  }
}

async function clearAll() {
  try {
    await ElMessageBox.confirm('确定要清空所有通知吗？', '提示', {
      type: 'warning'
    });
    clear();
  } catch {
    // 用户取消
  }
}

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  notifications.value = getAll();
  unsubscribe = subscribe((updatedNotifications) => {
    notifications.value = updatedNotifications;
  });
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});
</script>

<style scoped>
.notification-badge {
  display: inline-flex;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.empty-notifications {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notification-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.notification-item:hover {
  background: var(--hover-bg);
  transform: translateX(-2px);
}

.notification-item.unread {
  background: #e6f7ff;
  border-left: 3px solid #1890ff;
}

[data-theme='dark'] .notification-item.unread {
  background: #111d2c;
  border-left-color: #177ddc;
}

.notification-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-title {
  margin-bottom: 4px;
  color: var(--text-primary);
  font-weight: 600;
  font-size: 14px;
}

.notification-message {
  margin-bottom: 4px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.notification-time {
  color: var(--text-tertiary);
  font-size: 12px;
}
</style>
