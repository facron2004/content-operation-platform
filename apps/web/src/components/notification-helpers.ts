import type { Notification } from '../services/notification.service';
export function formatNotificationTime(timestamp: number): string {
  const diff = Date.now() - timestamp,
    minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60),
    days = Math.floor(hours / 24);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}
export function notificationIconType(type: Notification['type']): string {
  return `type-${type}`;
}
