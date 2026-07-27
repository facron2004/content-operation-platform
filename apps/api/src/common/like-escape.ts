/**
 * Escape SQLite LIKE wildcards so user-supplied search cannot broaden matches.
 * Caller still wraps with `%...%` for contains semantics.
 */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Build a contains pattern (`%escaped%`) for parameterized LIKE. */
export function likeContains(value: string): string {
  return `%${escapeLike(value)}%`;
}

/**
 * Prisma SQLite `contains` maps to LIKE without ESCAPE support.
 * Strip `%` / `_` / `\` so free-form search cannot broaden catalog matches.
 */
export function sanitizeContainsSearch(raw?: string, maxLen = 100): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .trim()
    .slice(0, maxLen)
    .replace(/[%_\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
}

/**
 * Match a JSON-stringified id array column that stores e.g. `["a1","a2"]`.
 * Rejects ids containing `"` / `\` (would break the quoted-token pattern).
 * Uses ESCAPE so `%`/`_` in the id cannot act as wildcards.
 */
export function jsonArrayIdLike(column: string, id: string): { sql: string; param: string } | null {
  // eslint-disable-next-line no-control-regex -- 有意拦截控制字符注入
  if (!id || /["\\\x00-\x1f]/.test(id) || id.length > 128) return null;
  return {
    sql: `${column} LIKE ? ESCAPE '\\'`,
    param: `%"${escapeLike(id)}"%`
  };
}
