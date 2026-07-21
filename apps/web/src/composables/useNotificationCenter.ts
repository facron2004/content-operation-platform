import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { useNotifications, type Notification } from '../services/notification.service';
export function useNotificationCenter() {
  const router = useRouter(),
    visible = ref(false),
    notifications = ref<Notification[]>([]);
  const { getAll, markAsRead, markAllAsRead, remove, clear, subscribe } = useNotifications();
  const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length);
  function handleClick(n: Notification) {
    markAsRead(n.id);
    if (n.actionUrl) {
      router.push(n.actionUrl);
      visible.value = false;
    }
  }
  async function clearAll() {
    try {
      await ElMessageBox.confirm('确定要清空所有通知吗？', '提示', { type: 'warning' });
      clear();
    } catch {
      /* cancelled */
    }
  }
  let unsubscribe: (() => void) | null = null;
  onMounted(() => {
    notifications.value = getAll();
    unsubscribe = subscribe((u) => {
      notifications.value = u;
    });
  });
  onUnmounted(() => unsubscribe?.());
  return { visible, notifications, unreadCount, markAllAsRead, remove, handleClick, clearAll };
}
