/**
 * Cap free-form path/query entity ids before they hit SQL, logs, or error messages.
 * Empty / whitespace-only inputs become '' so callers can reject or no-op.
 */
export function safePathId(value: unknown, maxLen = 64): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}
