/**
 * JeeSite 外部后端 URL 归一化与 SSRF 防御。
 *
 * 集中管理:
 * - 默认基础 URL fallback(`https://zdm.zhsh1.cn/a`)
 * - 同步/异步 URL 归一化(剥离尾斜杠、保留 /a 路径前缀)
 * - 主机名校验:拒绝 localhost、私网/loopback/link-local/CGNAT IP
 * - IPv4 字面量与 IPv6 私网段拒绝
 * - 主机名 → DNS 异步解析,任一解析结果命中私网即抛错
 *
 * 被 `jeesite-bargain-adapter.ts`(re-export)、`data-source.service.ts`、
 * `auto-login.service.ts`、`soldout.service.ts`、`html-fetcher.ts` 共同引用。
 */

/** 默认基础 URL,外部 EXTERNAL_API_BASE_URL 未配置时的兜底;集中在此便于 SSRF/合规审计 */
import { describeError } from '@content/shared';

export const DEFAULT_JEESITE_BASE_URL = 'https://zdm.zhsh1.cn/a';

export const adminFormUrl = (baseUrl: string | undefined, id: string) => {
  const normalized = normalizeJeesiteBaseUrlSync(baseUrl || DEFAULT_JEESITE_BASE_URL);
  return `${normalized}/bargain/bargainCommodity/form?id=${encodeURIComponent(id)}`;
};

/**
 * 同步版本:仅做字面 URL 解析 + 协议 + 字面 IP 私网校验。
 * 主机名形式的 DNS 解析放给 {@link normalizeJeesiteBaseUrl} (async)。
 * 仅在不需要发起网络请求的纯字符串场景(如拼详情 URL)使用。
 */
export function normalizeJeesiteBaseUrlSync(rawUrl: string) {
  const trimmed = rawUrl.trim().replace(/\/$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL: ${trimmed}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`URL must be http(s); got ${parsed.protocol}`);
  }
  assertHostnameNotPrivate(parsed.hostname);
  const adminIndex = parsed.pathname.indexOf('/a/');
  if (parsed.pathname === '/a' || parsed.pathname.startsWith('/a/')) {
    return `${parsed.origin}${adminIndex >= 0 ? parsed.pathname.slice(0, adminIndex + 2) : '/a'}`.replace(
      /\/$/,
      ''
    );
  }
  return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
}

/**
 * 异步版本:在同步校验基础上,额外做主机名 → IP 的 DNS 解析校验,
 * 防止攻击者把 DNS 指向私网/loopback 绕过同步层。
 */
export async function normalizeJeesiteBaseUrl(rawUrl: string) {
  const normalized = normalizeJeesiteBaseUrlSync(rawUrl);
  // 重新解析已归一化的 URL,拿到 hostname 做异步 DNS 校验
  const url = new URL(normalized);
  await assertHostnameNotPrivateAsync(url.hostname);
  return normalized;
}

/**
 * 拒绝指向私网 / loopback / metadata / link-local 的主机名,防止 SSRF。
 * IPv6 走单独的快速路径;主机名形式用异步 DNS 解析再判。
 *
 * 注意:此函数可能被同步调用点触发,我们在这里只处理"字面 IP/字面 IPv6"。
 * 主机名形式 → 在 fetch 路径上通过 {@link assertHostnameNotPrivateAsync} 异步解析并校验。
 */
function assertHostnameNotPrivate(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost') {
    throw new Error('EXTERNAL_API_BASE_URL must not point to localhost');
  }

  // IPv6: 任意形式的私网/loopback/link-local 都拒绝,只放行公网 IPv6
  if (lower.includes(':')) {
    if (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('::ffff:')
    ) {
      throw new Error(`EXTERNAL_API_BASE_URL must not use private/loopback IPv6 (${hostname})`);
    }
    return;
  }

  // IPv4 字面量直接判
  const ipv4 = parseIpv4(lower);
  if (ipv4) {
    if (isPrivateIpv4(ipv4)) {
      throw new Error(`EXTERNAL_API_BASE_URL must not point to private/loopback IP (${hostname})`);
    }
    return;
  }

  // 主机名(非字面 IP) → 静态层放过,在 fetch 路径上做异步 DNS 校验
}

/**
 * 异步 SSRF 校验:解析主机名,任意解析结果命中私网/loopback 即抛错。
 * 应在每次 fetch 前调用一次(命中 5 分钟缓存则不必重复)。
 */
export async function assertHostnameNotPrivateAsync(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost') {
    throw new Error(`EXTERNAL_API_BASE_URL must not point to localhost`);
  }
  // 字面 IP 走同步路径
  if (lower.includes(':') || parseIpv4(lower)) {
    assertHostnameNotPrivate(lower);
    return;
  }
  // 主机名 → 异步解析
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
    if (address.includes(':')) {
      throw new Error(
        `EXTERNAL_API_BASE_URL resolves to IPv6 (${hostname} -> ${address}); IPv6 not allowed for safety`
      );
    }
    const ip = parseIpv4(address);
    if (ip && isPrivateIpv4(ip)) {
      throw new Error(
        `EXTERNAL_API_BASE_URL resolves to private/loopback IP (${hostname} -> ${address})`
      );
    }
  }
}

function parseIpv4(host: string): number | null {
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

function isPrivateIpv4(ip: number): boolean {
  const oct1 = (ip >>> 24) & 0xff;
  const oct2 = (ip >>> 16) & 0xff;
  // 10.0.0.0/8
  if (oct1 === 10) return true;
  // 172.16.0.0/12
  if (oct1 === 172 && oct2 >= 16 && oct2 <= 31) return true;
  // 192.168.0.0/16
  if (oct1 === 192 && oct2 === 168) return true;
  // 127.0.0.0/8 loopback
  if (oct1 === 127) return true;
  // 169.254.0.0/16 link-local (含云 metadata 169.254.169.254)
  if (oct1 === 169 && oct2 === 254) return true;
  // 0.0.0.0/8
  if (oct1 === 0) return true;
  // 100.64.0.0/10 CGNAT
  if (oct1 === 100 && oct2 >= 64 && oct2 <= 127) return true;
  return false;
}
