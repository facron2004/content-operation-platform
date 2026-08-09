/** Fetch one JeeSite order page with bounded response and redirect handling. */
import { isRecord } from '@content/shared';
import { Logger } from '@nestjs/common';
import { AutoLoginService } from '../content/auto-login.service';
import { assertHostnameNotPrivateAsync } from '../content/jeesite-url';
import {
  JSON_RESPONSE_MAX_BYTES,
  readResponseText,
  ResponseBodyTooLargeError
} from '../common/response-body';
import { fetchOrderPageWithRenewal as fetchOrderPageWithRenewalImpl } from './gmv-refresh-support';

/** Cap for non-OK error bodies — never materialize multi-MB HTML into throw messages. */
const ERROR_BODY_MAX_BYTES = 8 * 1024;

export async function fetchOrderPage(url: URL, cookie: string): Promise<unknown | null> {
  const FETCH_TIMEOUT_MS = 30000,
    controller = new AbortController(),
    timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = { Cookie: cookie, 'x-ajax': 'json', Accept: 'application/json' };
    let res = await fetch(url.toString(), {
      headers,
      redirect: 'manual',
      signal: controller.signal
    });
    // SSRF-safe single hop: only follow when hostname matches origin.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location) {
        const redirectUrl = new URL(location, url);
        if (
          (redirectUrl.protocol === 'http:' || redirectUrl.protocol === 'https:') &&
          redirectUrl.hostname === url.hostname
        ) {
          await assertHostnameNotPrivateAsync(redirectUrl.hostname);
          res = await fetch(redirectUrl.toString(), {
            headers,
            redirect: 'manual',
            signal: controller.signal
          });
        }
      }
    }
    if (!res.ok) {
      let snippet = '';
      try {
        snippet = await readResponseText(res, ERROR_BODY_MAX_BYTES);
      } catch {
        snippet = '[body unreadable]';
      }
      throw new Error(`JeSite HTTP ${res.status}: ${snippet.slice(0, 200).replace(/\s+/g, ' ')}`);
    }
    let rawText: string;
    try {
      rawText = await readResponseText(res, JSON_RESPONSE_MAX_BYTES);
    } catch (err) {
      if (err instanceof ResponseBodyTooLargeError) {
        throw new Error(`JeSite order page exceeds max ${JSON_RESPONSE_MAX_BYTES} bytes`);
      }
      throw err;
    }
    if (rawText.trimStart().startsWith('<')) return null;
    try {
      const parsed = JSON.parse(rawText) as unknown;
      if (isRecord(parsed) && parsed.result === 'login') return null;
      return parsed;
    } catch {
      return null;
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

export function fetchOrderPageWithRenewal(params: {
  url: URL;
  cookieHeader: string | null | undefined;
  autoLogin?: AutoLoginService;
  logger: Logger;
}) {
  return fetchOrderPageWithRenewalImpl({
    ...params,
    fetchPage: fetchOrderPage
  });
}
