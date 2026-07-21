import type { LoggerService } from '@nestjs/common';
import { describeError, isRecord } from '@content/shared';
import { containsLoginPageMarker, LOGIN_INVALID_CREDENTIALS_MARKER } from '../common/login-markers';
import { assertHostnameNotPrivateAsync, DEFAULT_USER_AGENT } from './jeesite-url';

const BARGAIN_COOKIE_TEMPLATE =
  'skinName=skin-green; jeesite.session.id=${sessionId}; pageSize=10; pageNo=1';
const LOGIN_FETCH_TIMEOUT_MS = 8_000;

export interface LoginResult {
  success: boolean;
  cookie?: string;
  error?: string;
}

export const buildBargainCookie = (sessionId: string): string =>
  BARGAIN_COOKIE_TEMPLATE.replace('${sessionId}', sessionId);

export function maskIdentifier(value: string): string {
  if (value.length <= 4) return '***';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function maskCookie(value: string): string {
  return value.replace(/([^=;\s,]+)=([^;\s,]+)/g, '$1=***');
}

function parseSingleCookie(cookieString: string, cookies: Record<string, string>): void {
  const nameValue = cookieString.split(';')[0];
  const parts = nameValue.split('=');
  if (parts.length < 2) return;
  cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
}

export function parseAllSetCookies(setCookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  const parts = setCookieHeader.split(', ');
  let currentCookie = '';

  for (const part of parts) {
    if (part.includes('=') && !part.match(/^\w{3},?\s+\d{1,2}/)) {
      if (currentCookie) parseSingleCookie(currentCookie, cookies);
      currentCookie = part;
    } else {
      currentCookie = `${currentCookie}, ${part}`;
    }
  }
  if (currentCookie) parseSingleCookie(currentCookie, cookies);
  return cookies;
}

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGIN_FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function validateBaseUrl(baseUrl: string): Promise<string | null> {
  try {
    await assertHostnameNotPrivateAsync(new URL(baseUrl).hostname);
    return null;
  } catch (error: unknown) {
    return describeError(error);
  }
}

export async function validateJeesiteCookie(cookie: string, baseUrl?: string): Promise<boolean> {
  if (!baseUrl || (await validateBaseUrl(baseUrl))) return false;
  try {
    const testUrl = `${baseUrl}/bargain/bargainCommodity/listData?pageSize=1&pageNo=1`;
    const response = await fetchWithTimeout(testUrl, {
      headers: { Cookie: cookie, 'x-ajax': 'json' }
    });
    if (!response.ok) return false;

    const text = await response.text();
    if (containsLoginPageMarker(text)) return false;
    try {
      const data = JSON.parse(text);
      return isRecord(data) && data.result !== 'login';
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

async function finishLogin(
  setCookieHeader: string | null,
  source: 'redirect' | 'login',
  baseUrl: string,
  logger: LoggerService
): Promise<LoginResult> {
  if (!setCookieHeader) {
    const error =
      source === 'redirect' ? 'No cookie in redirect response' : 'No cookie returned from login';
    logger.error(error);
    return { success: false, error };
  }

  const cookies = parseAllSetCookies(setCookieHeader);
  const sessionId = cookies['jeesite.session.id'];
  if (!sessionId) {
    logger.error(
      `No session ID in ${source} response. Available cookies: ${Object.keys(cookies).join(', ')}`
    );
    return {
      success: false,
      error:
        source === 'redirect'
          ? 'No session ID in redirect response'
          : 'No session ID in login response'
    };
  }

  const cookie = buildBargainCookie(sessionId);
  if (!(await validateJeesiteCookie(cookie, baseUrl))) {
    logger.error('Login succeeded but cookie validation failed');
    return { success: false, error: 'Login succeeded but cookie validation failed' };
  }
  logger.log('Cookie validation successful');
  return { success: true, cookie };
}

export async function loginToJeesite(params: {
  username?: string;
  password?: string;
  baseUrl?: string;
  logger: LoggerService;
}): Promise<LoginResult> {
  const { username, password, baseUrl, logger } = params;
  if (!username || !password) {
    const error = 'EXTERNAL_API_USERNAME and EXTERNAL_API_PASSWORD are required for auto login';
    logger.error(error);
    return { success: false, error };
  }
  if (!baseUrl) {
    const error = 'EXTERNAL_API_BASE_URL is required';
    logger.error(error);
    return { success: false, error };
  }

  const baseUrlError = await validateBaseUrl(baseUrl);
  if (baseUrlError) {
    logger.error(`SSRF guard rejected EXTERNAL_API_BASE_URL: ${baseUrlError}`);
    return { success: false, error: `EXTERNAL_API_BASE_URL is not allowed: ${baseUrlError}` };
  }

  logger.log(`Attempting auto login for user: ${maskIdentifier(username)}`);
  try {
    const loginPageUrl = `${baseUrl}/login`;
    const pageResponse = await fetchWithTimeout(loginPageUrl, {
      method: 'GET',
      redirect: 'manual'
    });
    const initialCookies = pageResponse.headers.get('set-cookie');
    const initialCookieString = initialCookies
      ? Object.entries(parseAllSetCookies(initialCookies))
          .map(([name, value]) => `${name}=${value}`)
          .join('; ')
      : '';

    const loginUrl = baseUrl.endsWith('/a') ? `${baseUrl}/login` : `${baseUrl}/a/login`;
    const formData = new URLSearchParams({
      username: Buffer.from(username).toString('base64'),
      password: Buffer.from(password).toString('base64'),
      validCode: '',
      __url: ''
    });
    const loginResponse = await fetchWithTimeout(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: initialCookieString,
        'User-Agent': DEFAULT_USER_AGENT,
        Referer: loginPageUrl
      },
      body: formData.toString(),
      redirect: 'manual'
    });
    const loginCookies = loginResponse.headers.get('set-cookie');

    if (loginResponse.status === 301 || loginResponse.status === 302) {
      const location = loginResponse.headers.get('location');
      if (location && (location.includes('loginFailure') || location.includes('login?'))) {
        const error =
          'Login failed: Captcha required or invalid credentials. Please login manually and update EXTERNAL_API_COOKIE in .env';
        logger.error(`Login failed: redirected to ${location}`);
        return { success: false, error };
      }
      return finishLogin(loginCookies, 'redirect', baseUrl, logger);
    }

    const responseText = await loginResponse.text();
    if (
      responseText.includes('loginForm') ||
      responseText.includes(LOGIN_INVALID_CREDENTIALS_MARKER)
    ) {
      const error = 'Login failed: Invalid credentials';
      logger.error(error);
      return { success: false, error };
    }
    return finishLogin(loginCookies, 'login', baseUrl, logger);
  } catch (error: unknown) {
    const message = describeError(error);
    logger.error(`Login error: ${message}`);
    return { success: false, error: message };
  }
}
