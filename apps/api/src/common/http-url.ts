/**
 * Accept only http(s) absolute URLs for user-supplied link fields
 * (evidence, callbacks). Rejects javascript:/data:/file: etc.
 */
export function isHttpUrl(value: string | undefined | null, maxLen = 500): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.length > maxLen) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Normalize optional URL; returns undefined for empty/invalid. */
export function normalizeHttpUrl(
  value: string | undefined | null,
  maxLen = 500
): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return isHttpUrl(trimmed, maxLen) ? trimmed.slice(0, maxLen) : undefined;
}
