import { randomShortId } from '@content/shared';

export interface Notification {
  id: string;
  type: 'alert' | 'success' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actionUrl?: string;
}

/** 添加新通知时客户端提供的字段,id/timestamp/read 由服务生成。 */
export type NotificationDraft = Omit<Notification, 'id' | 'timestamp' | 'read'>;

type NotificationListener = (notifications: Notification[]) => void;

function notifyNotificationListeners(
  listeners: Set<NotificationListener>,
  notifications: Notification[]
): void {
  listeners.forEach((listener) => listener(notifications));
}

class NotificationStore {
  private notifications: Notification[] = [];
  private listeners = new Set<NotificationListener>();
  add(n: NotificationDraft) {
    this.notifications.unshift({
      ...n,
      id: `${Date.now()}_${randomShortId()}`,
      timestamp: Date.now(),
      read: false
    });
    this.notify();
  }
  getAll(): Notification[] {
    return [...this.notifications];
  }
  getUnread(): Notification[] {
    return this.notifications.filter((n) => !n.read);
  }
  markAsRead(id: string) {
    const n = this.notifications.find((item) => item.id === id);
    if (!n) return;
    n.read = true;
    this.notify();
  }
  markAllAsRead() {
    this.notifications.forEach((n) => (n.read = true));
    this.notify();
  }
  remove(id: string) {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.notify();
  }
  clear() {
    this.notifications = [];
    this.notify();
  }
  subscribe(listener: NotificationListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify() {
    notifyNotificationListeners(this.listeners, this.notifications);
  }
}

export const notificationService = new NotificationStore();

export function useNotifications() {
  return {
    add: (notification: NotificationDraft) => notificationService.add(notification),
    getAll: () => notificationService.getAll(),
    getUnread: () => notificationService.getUnread(),
    markAsRead: (id: string) => notificationService.markAsRead(id),
    markAllAsRead: () => notificationService.markAllAsRead(),
    remove: (id: string) => notificationService.remove(id),
    clear: () => notificationService.clear(),
    subscribe: (listener: (notifications: Notification[]) => void) =>
      notificationService.subscribe(listener)
  };
}
