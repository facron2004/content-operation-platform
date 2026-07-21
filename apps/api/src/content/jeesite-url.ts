import { describeError } from '@content/shared';

/** Browser-like UA for JeeSite requests. */
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export const DEFAULT_JEESITE_BASE_URL = 'https://zdm.zhsh1.cn/a';

export const adminFormUrl = (baseUrl: string | undefined, id: string) =>
  `${normalizeJeesiteBaseUrlSync(baseUrl || DEFAULT_JEESITE_BASE_URL)}/bargain/bargainCommodity/form?id=${encodeURIComponent(id)}`;

export function parseIpv4(host: string): number | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    result = result * 256 + n;
  }
  return result;
}

export function isPrivateIpv4(ip: number): boolean {
  const oct1 = (ip >>> 24) & 0xff,
    oct2 = (ip >>> 16) & 0xff;
  if (oct1 === 10 || oct1 === 127 || oct1 === 0) return true;
  if (oct1 === 172 && oct2 >= 16 && oct2 <= 31) return true;
  if (oct1 === 192 && oct2 === 168) return true;
  if (oct1 === 169 && oct2 === 254) return true;
  if (oct1 === 100 && oct2 >= 64 && oct2 <= 127) return true;
  return false;
}

export function assertHostnameNotPrivate(hostname: string): void {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost') throw new Error('EXTERNAL_API_BASE_URL must not point to localhost');
  if (lower.includes(':')) {
    if (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('::ffff:')
    )
      throw new Error(`EXTERNAL_API_BASE_URL must not use private/loopback IPv6 (${hostname})`);
    return;
  }
  const ipv4 = parseIpv4(lower);
  if (ipv4 && isPrivateIpv4(ipv4)) {
    throw new Error(`EXTERNAL_API_BASE_URL must not point to private/loopback IP (${hostname})`);
  }
}

export async function assertHostnameNotPrivateAsync(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost') throw new Error(`EXTERNAL_API_BASE_URL must not point to localhost`);
  if (lower.includes(':') || parseIpv4(lower)) {
    assertHostnameNotPrivate(lower);
    return;
  }
  const dns = require('node:dns') as typeof import('node:dns');
  let addrs: Array<{ address: string }>;
  try {
    addrs = await new Promise<Array<{ address: string }>>((resolveAll, reject) => {
      dns.lookup(lower, { all: true }, (err, addresses) => {
        if (err) reject(err);
        else resolveAll(addresses);
      });
    });
  } catch (err: unknown) {
    throw new Error(
      `EXTERNAL_API_BASE_URL DNS resolution failed for ${hostname}: ${describeError(err)}`
    );
  }
  for (const { address } of addrs) {
    if (address.includes(':'))
      throw new Error(
        `EXTERNAL_API_BASE_URL resolves to IPv6 (${hostname} -> ${address}); IPv6 not allowed for safety`
      );
    const ip = parseIpv4(address);
    if (ip && isPrivateIpv4(ip))
      throw new Error(
        `EXTERNAL_API_BASE_URL resolves to private/loopback IP (${hostname} -> ${address})`
      );
  }
}

export function normalizeJeesiteBaseUrlSync(rawUrl: string) {
  const trimmed = rawUrl.trim().replace(/\/$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL: ${trimmed}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new Error(`URL must be http(s); got ${parsed.protocol}`);
  assertHostnameNotPrivate(parsed.hostname);
  const adminIndex = parsed.pathname.indexOf('/a/');
  if (parsed.pathname === '/a' || parsed.pathname.startsWith('/a/'))
    return `${parsed.origin}${adminIndex >= 0 ? parsed.pathname.slice(0, adminIndex + 2) : '/a'}`.replace(
      /\/$/,
      ''
    );
  return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
}

export async function normalizeJeesiteBaseUrl(rawUrl: string) {
  const normalized = normalizeJeesiteBaseUrlSync(rawUrl);
  await assertHostnameNotPrivateAsync(new URL(normalized).hostname);
  return normalized;
}
