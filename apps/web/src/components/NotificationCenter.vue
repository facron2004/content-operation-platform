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
        <div class="notification-icon" :class="`type-${notification.type}`">
          <el-icon v-if="notification.type === 'success'">
            <SuccessFilled />
          </el-icon>
          <el-icon v-else-if="notification.type === 'warning'">
            <WarningFilled />
          </el-icon>
          <el-icon v-else-if="notification.type === 'alert'">
            <CircleCloseFilled />
          </el-icon>
          <el-icon v-else>
            <InfoFilled />
          </el-icon>
        </div>

        <div class="notification-content">
          <div class="notification-title-row">
            <div class="notification-title">{{ notification.title }}</div>
            <span v-if="!notification.read" class="unread-dot" />
          </div>
          <div class="notification-message">{{ notification.message }}</div>
          <div class="notification-time">{{ formatTime(notification.timestamp) }}</div>
        </div>

        <el-button
          size="small"
          circle
          text
          class="remove-button"
          @click.stop="remove(notification.id)"
        >
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

.notification-trigger {
  box-shadow: var(--shadow-soft);
}

.notification-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.notification-header strong {
  display: block;
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
}

.notification-header p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.notification-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.empty-notifications {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
  border: 1px dashed var(--line);
  border-radius: var(--radius);
  background: var(--soft);
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
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--panel);
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
  box-shadow: var(--shadow-soft);
}

.notification-item:hover {
  border-color: var(--line);
  background: var(--soft);
  transform: translateY(-1px);
  box-shadow: var(--shadow);
}

.notification-item.unread {
  border-color: var(--accent-line);
  background: linear-gradient(180deg, rgba(238, 244, 255, 0.95), #fff);
}

.notification-item.unread:hover {
  border-color: rgba(37, 99, 235, 0.24);
}

.notification-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--soft);
  color: var(--ink-soft);
}

.notification-icon.type-success {
  background: var(--success-soft);
  color: var(--success);
}

.notification-icon.type-warning {
  background: var(--warning-soft);
  color: var(--warning);
}

.notification-icon.type-alert {
  background: var(--danger-soft);
  color: var(--danger);
}

.notification-icon.type-info {
  background: var(--accent-soft);
  color: var(--accent);
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}

.notification-title {
  color: var(--ink);
  font-weight: 700;
  font-size: 14px;
}

.unread-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}

.notification-message {
  margin-bottom: 4px;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.55;
}

.notification-time {
  color: var(--muted);
  font-size: 12px;
}

.remove-button {
  align-self: flex-start;
  color: var(--muted);
}

.remove-button:hover {
  color: var(--danger);
}
</style>
