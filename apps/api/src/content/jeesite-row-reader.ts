import { isRecord } from '@content/shared';

export type AnyRecord = Record<string, unknown>;
export type RowFieldSet = readonly string[];

const LIST_KEYS = ['list', 'rows', 'records', 'items', 'data', 'page', 'result'] as const;
const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'y', 'on', '是', '开启', '启用']);
const FALSY_VALUES = new Set(['0', 'false', 'no', 'n', 'off', '否', '关闭', '禁用']);

export function extractRows(value: unknown): AnyRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];

  for (const key of LIST_KEYS) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested.filter(isRecord);
    if (isRecord(nested)) {
      const rows = extractRows(nested);
      if (rows.length > 0) return rows;
    }
  }
  return [];
}

function valueAtPath(row: AnyRecord, key: string): unknown {
  if (!key.includes('.')) return row[key];

  let current: unknown = row;
  for (const part of key.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function pick(row: AnyRecord, keys: RowFieldSet): unknown {
  for (const key of keys) {
    const value = valueAtPath(row, key);
    if (value != null && value !== '') return value;
  }
  return undefined;
}

export function rowText(row: AnyRecord, keys: RowFieldSet, fallback = ''): string {
  const value = pick(row, keys);
  return value === undefined ? fallback : String(value).trim();
}

export function rowNumber(row: AnyRecord, keys: RowFieldSet, fallback = 0): number {
  const value = pick(row, keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').replace(/[^\d.-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function rowBoolean(row: AnyRecord, keys: RowFieldSet, fallback = false): boolean {
  const value = pick(row, keys);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (TRUTHY_VALUES.has(normalized)) return true;
    if (FALSY_VALUES.has(normalized)) return false;
  }
  return fallback;
}

export function rowMoney(
  row: AnyRecord,
  yuanKeys: RowFieldSet,
  centKeys: RowFieldSet,
  fallback = 0
): number {
  const cents = rowNumber(row, centKeys, Number.NaN);
  if (Number.isFinite(cents)) return Math.round((cents / 100) * 100) / 100;
  return rowNumber(row, yuanKeys, fallback);
}

export function normalizeRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 100 : value;
}

export function rowDateText(row: AnyRecord, keys: RowFieldSet, fallback: string): string {
  for (const key of keys) {
    const raw = row[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const milliseconds = raw < 1e12 ? raw * 1000 : raw;
      const date = new Date(milliseconds);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }

  const value = rowText(row, keys);
  if (!value) return fallback;
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
  const hasTimezone = /[Zz]$|[+-]\d{2}:\d{2}$/.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}+08:00`);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}
