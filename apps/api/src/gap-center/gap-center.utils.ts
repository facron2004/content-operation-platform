import { createHash } from 'node:crypto';

export function optionalDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

export function nullableDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function maskPhone(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length <= 7) return `${normalized.slice(0, 2)}****`;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

export function pageResult<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number
): { items: T[]; pagination: { page: number; pageSize: number; total: number; hasMore: boolean } } {
  return {
    items,
    pagination: { page, pageSize, total, hasMore: page * pageSize < total }
  };
}
