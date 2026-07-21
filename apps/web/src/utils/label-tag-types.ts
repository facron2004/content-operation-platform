export type TagType = 'success' | 'primary' | 'warning' | 'info' | 'danger';
type AlertLevel = 'success' | 'danger' | 'warning' | 'info';
const LEVEL_TO_TAG_TYPE: Record<AlertLevel, TagType> = {
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  info: 'info'
};
const ALERT_LEVELS: readonly AlertLevel[] = ['success', 'danger', 'warning', 'info'];
const isAlertLevel = (value: string): value is AlertLevel =>
  (ALERT_LEVELS as readonly string[]).includes(value);
const normalizeLevel = (level?: string): AlertLevel =>
  level && isAlertLevel(level) ? level : 'info';
export function levelToTagType(level?: string): TagType {
  return LEVEL_TO_TAG_TYPE[normalizeLevel(level)];
}
export const riskTagType = levelToTagType;
export const inventoryTagType = levelToTagType;
export const salesTagType = levelToTagType;
export const operationTagType = levelToTagType;
export const alertTagType = levelToTagType;
export function levelText(level?: string): string {
  const n = normalizeLevel(level);
  return n === 'danger' ? '高危' : n === 'warning' ? '警告' : '提醒';
}
