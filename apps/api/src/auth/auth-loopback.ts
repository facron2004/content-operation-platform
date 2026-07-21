export function normalizeLoopbackAddress(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/^::ffff:/, '').trim();
}
export const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '0:0:0:0:0:0:0:1']);
export function isLoopbackRemoteAddress(value: string | undefined): boolean {
  return LOOPBACK_ADDRESSES.has(normalizeLoopbackAddress(value));
}
