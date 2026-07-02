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

class NotificationService {
  private notifications: Notification[] = [];
  private listeners: Set<(notifications: Notification[]) => void> = new Set();

  add(notification: NotificationDraft) {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}_${randomShortId()}`,
      timestamp: Date.now(),
      read: false
    };

    this.notifications.unshift(newNotification);
    this.notifyListeners();
  }

  getAll(): Notification[] {
    return [...this.notifications];
  }

  getUnread(): Notification[] {
    return this.notifications.filter((n) => !n.read);
  }

  markAsRead(id: string) {
    const notification = this.notifications.find((n) => n.id === id);
    if (notification) {
      notification.read = true;
      this.notifyListeners();
    }
  }

  markAllAsRead() {
    this.notifications.forEach((n) => (n.read = true));
    this.notifyListeners();
  }

  remove(id: string) {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.notifyListeners();
  }

  clear() {
    this.notifications = [];
    this.notifyListeners();
  }

  subscribe(listener: (notifications: Notification[]) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this.notifications));
  }
}

export const notificationService = new NotificationService();

// Vue composable
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
