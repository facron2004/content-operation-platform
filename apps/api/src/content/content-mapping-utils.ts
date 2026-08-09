export const splitList = (value: string | null | undefined) =>
  value
    ? value
        .split(/[、,，;；|｜\n]/g)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

export const joinList = (items: string[]) => items.join('｜');

export const castEnum = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
