/**
 * Accept only absolute http(s) URLs for rendering as href.
 * Rejects javascript:/data:/relative/ftp to prevent XSS via stored evidence links.
 */
export function safeHttpUrl(value: string | undefined | null, maxLen = 500): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return undefined;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return trimmed.slice(0, maxLen);
  } catch {
    return undefined;
  }
}
