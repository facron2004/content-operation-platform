/**
 * Sanitize post-login redirect targets from ?redirect=.
 * Only same-app relative paths are allowed — blocks open redirects.
 */
export function resolveLoginRedirect(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return '/';
  const candidate = value.trim();
  // Only allow same-app relative paths — block protocol-relative //evil and absolute URLs.
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return '/';
  }
  // Drop any scheme-like substring (e.g. /javascript:alert(1)).
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate.slice(1))) {
    return '/';
  }
  // Cap length so a multi-KB query redirect cannot bloat history/logs.
  return candidate.slice(0, 500) || '/';
}
