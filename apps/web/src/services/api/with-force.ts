export function withForce(url: string, force?: boolean): string {
  if (!force) return url;
  const sep = url.includes('?') ? '&' : '?';
  // No `_` cache-buster: gmv/* and merchant-sales summary/ranking/trend use
  // forbidNonWhitelisted query DTOs, so an unknown `_` param returns 400 on
  // force-refresh. `force=true` is the declared, accepted bypass flag.
  return `${url}${sep}force=true`;
}
