import { toSqliteDateTime } from '../common/sqlite-datetime';

/** JeeSite returns timestamps without a zone; the source system is Beijing time. */
export function parseJeeSiteDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const date = new Date(hasZone ? normalized : `${normalized}+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toJeeSiteSqliteDate(value: unknown): string | null {
  const date = parseJeeSiteDate(value);
  return date ? toSqliteDateTime(date) : null;
}
