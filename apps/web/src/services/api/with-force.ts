export function withForce(url: string, force?: boolean): string {
  if (!force) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_=${Date.now()}&force=true`;
}
