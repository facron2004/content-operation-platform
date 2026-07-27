import { toSqliteDateTime } from './sqlite-datetime';

/** Attribution + public tracking window length by distribution channel (hours). */
export const CHANNEL_WINDOW_HOURS: Record<string, number> = {
  wechat_group: 24,
  moments: 72,
  merchant_share: 48
};

export const DEFAULT_CHANNEL_WINDOW_HOURS = 24;

export function channelWindowHours(channel: string | null | undefined): number {
  if (!channel) return DEFAULT_CHANNEL_WINDOW_HOURS;
  return CHANNEL_WINDOW_HOURS[channel] ?? DEFAULT_CHANNEL_WINDOW_HOURS;
}

/**
 * Inclusive window end as SQLite datetime text (UTC space form).
 * Corrupt publishedAt falls back to now+window so callers never throw on bad data.
 */
export function channelWindowEnd(
  publishedAt: string | Date | number | null | undefined,
  channel: string | null | undefined
): string {
  const hours = channelWindowHours(channel);
  const startMs =
    publishedAt instanceof Date
      ? publishedAt.getTime()
      : typeof publishedAt === 'number'
        ? publishedAt
        : publishedAt
          ? new Date(publishedAt).getTime()
          : NaN;
  if (!Number.isFinite(startMs)) {
    return toSqliteDateTime(Date.now() + hours * 60 * 60 * 1000);
  }
  return toSqliteDateTime(startMs + hours * 60 * 60 * 1000);
}

/** True when now is still inside [publishedAt, publishedAt+channel window]. */
export function isWithinChannelWindow(
  publishedAt: string | Date | number | null | undefined,
  channel: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (publishedAt == null || publishedAt === '') return false;
  const startMs =
    publishedAt instanceof Date
      ? publishedAt.getTime()
      : typeof publishedAt === 'number'
        ? publishedAt
        : new Date(publishedAt).getTime();
  if (!Number.isFinite(startMs)) return false;
  const endMs = startMs + channelWindowHours(channel) * 60 * 60 * 1000;
  return nowMs >= startMs && nowMs <= endMs;
}
