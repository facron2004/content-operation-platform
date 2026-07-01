import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { assertHostnameNotPrivateAsync } from './jeesite-bargain-adapter';
import { DEFAULT_USER_AGENT } from './http-headers';

/** JeeSite 登录后构造的完整 Cookie 模板,使用 `${0}` 替换 sessionId。 */
const BARGAIN_COOKIE_TEMPLATE =
  'skinName=skin-green; jeesite.session.id=${sessionId}; pageSize=10; pageNo=1';

const buildBargainCookie = (sessionId: string): string =>
  BARGAIN_COOKIE_TEMPLATE.replace('${sessionId}', sessionId);

interface LoginResult {
  success: boolean;
  cookie?: string;
  error?: string;
}

@Injectable()
export class AutoLoginService implements OnModuleInit {
  private readonly logger = new Logger(AutoLoginService.name);
  private cachedCookie: string | null = null;
  private lastLoginTime = 0;
  private loginInProgress: Promise<LoginResult> | null = null;
  private failedAttempts = 0;
  private lastFailedTime = 0;

  async onModuleInit() {
    await this.loadCookieFromCacheFile();
    if (!this.cachedCookie) {
      await this.refreshExpiredCookie('startup');
    }
  }

  private async loadCookieFromCacheFile() {
    try {
      const cachePath = path.resolve(process.cwd(), '.cookie.cache');
      const exists = await fs
        .access(cachePath)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        const data = await fs.readFile(cachePath, 'utf8');
        const cookie = data.trim();
        if (cookie) {
          const isValid = await this.validateCookie(cookie);
          if (isValid) {
            this.cachedCookie = cookie;
            this.lastLoginTime = Date.now();
            this.failedAttempts = 0;
            this.logger.log('Loaded and validated cached cookie from .cookie.cache');
          } else {
            this.logger.warn('Cached cookie from .cookie.cache is invalid or expired');
          }
        }
      }
    } catch (err) {
      this.logger.error('Failed to load cookie from cache file:', err);
    }
  }

  private async saveCookieToCacheFile(cookie: string) {
    try {
      const cachePath = path.resolve(process.cwd(), '.cookie.cache');
      await fs.writeFile(cachePath, cookie, 'utf8');
      this.logger.log('Saved valid cookie to .cookie.cache');
    } catch (err) {
      this.logger.error('Failed to save cookie to cache file:', err);
    }
  }

  async ensureValidCookie(forceRefresh = false): Promise<string | null> {
    const now = Date.now();
    const cooledDownCookie = this.resolveCooldownCookie(now);
    if (cooledDownCookie !== undefined) return cooledDownCookie;

    if (forceRefresh) {
      this.logger.log('Force refresh requested, performing auto login');
      return await this.performLogin();
    }

    const cachedCookie = this.getFreshCachedCookie(now);
    if (cachedCookie) return cachedCookie;

    const envCookie = this.getEnvironmentCookie();
    if (envCookie) {
      const isValid = await this.validateCookie(envCookie);
      if (isValid) {
        this.cachedCookie = envCookie;
        this.lastLoginTime = Date.now();
        this.failedAttempts = 0;
        await this.saveCookieToCacheFile(envCookie);
        return envCookie;
      }
      this.logger.warn('Environment cookie is invalid or expired, performing auto login');
      return await this.performLogin();
    }

    if (this.loginInProgress) {
      this.logger.debug('Login in progress, waiting...');
      const result = await this.loginInProgress;
      return result.success ? result.cookie || null : null;
    }

    this.logger.log('No valid cached cookie, performing auto login');
    return await this.performLogin();
  }

  private async refreshExpiredCookie(reason: string): Promise<string | null> {
    this.logger.log(`Refreshing JeeSite cookie automatically (${reason})`);
    return await this.performLogin();
  }

  private resolveCooldownCookie(now: number): string | null | undefined {
    if (this.failedAttempts < 3) return undefined;

    const timeSinceLastFail = now - this.lastFailedTime;
    const waitTime = Math.min(30 * 60 * 1000, 5 * 60 * 1000 * Math.pow(2, this.failedAttempts - 3));
    if (timeSinceLastFail >= waitTime) {
      this.logger.log('Cooldown period expired, resetting failed attempts counter');
      this.failedAttempts = 0;
      return undefined;
    }

    const remainingWait = Math.ceil((waitTime - timeSinceLastFail) / 1000 / 60);
    this.logger.warn(
      `Too many failed login attempts (${this.failedAttempts}). Please wait ${remainingWait} more minutes or login manually.`
    );
    return this.getEnvironmentCookie();
  }

  private getFreshCachedCookie(now: number) {
    if (this.cachedCookie && now - this.lastLoginTime < 2 * 60 * 60 * 1000) {
      this.logger.debug('Using cached cookie');
      return this.cachedCookie;
    }
    return null;
  }

  private getEnvironmentCookie() {
    if (process.env.EXTERNAL_API_COOKIE && !this.cachedCookie) {
      this.logger.debug('Using cookie from environment variable');
      return process.env.EXTERNAL_API_COOKIE;
    }
    return null;
  }

  private async performLogin(): Promise<string | null> {
    this.loginInProgress = this.doLogin();
    try {
      const result = await this.loginInProgress;
      if (result.success && result.cookie) {
        this.cachedCookie = result.cookie;
        this.lastLoginTime = Date.now();
        this.failedAttempts = 0; // 重置失败计数
        this.logger.log(`Auto login successful, new cookie: ${this.maskCookie(result.cookie)}`);
        await this.saveCookieToCacheFile(result.cookie);
        return result.cookie;
      } else {
        this.failedAttempts++;
        this.lastFailedTime = Date.now();
        this.logger.error(`Auto login failed (attempt ${this.failedAttempts}): ${result.error}`);
        return null;
      }
    } finally {
      this.loginInProgress = null;
    }
  }

  private async doLogin(): Promise<LoginResult> {
    const username = process.env.EXTERNAL_API_USERNAME;
    const password = process.env.EXTERNAL_API_PASSWORD;
    const baseUrl = process.env.EXTERNAL_API_BASE_URL;

    if (!username || !password) {
      this.logger.error(
        'EXTERNAL_API_USERNAME and EXTERNAL_API_PASSWORD are required for auto login'
      );
      return {
        success: false,
        error: 'EXTERNAL_API_USERNAME and EXTERNAL_API_PASSWORD are required for auto login'
      };
    }

    if (!baseUrl) {
      this.logger.error('EXTERNAL_API_BASE_URL is required');
      return {
        success: false,
        error: 'EXTERNAL_API_BASE_URL is required'
      };
    }

    // SSRF 防护:拒绝指向私网/loopback/元数据服务的主机名。
    // 否则攻击者把 EXTERNAL_API_BASE_URL 改成 http://10.0.0.1 / http://169.254.169.254
    // 就能让本服务主动探测内网或窃取云凭证。
    try {
      await assertHostnameNotPrivateAsync(new URL(baseUrl).hostname);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`SSRF guard rejected EXTERNAL_API_BASE_URL: ${message}`);
      return {
        success: false,
        error: `EXTERNAL_API_BASE_URL is not allowed: ${message}`
      };
    }

    this.logger.log(`Attempting auto login for user: ${this.maskIdentifier(username)}`);

    try {
      // 第一步：访问登录页面获取初始 Cookie
      const loginPageUrl = `${baseUrl}/login`;
      this.logger.debug(`Fetching login page: ${loginPageUrl}`);

      const pageResponse = await fetch(loginPageUrl, {
        method: 'GET',
        redirect: 'manual'
      });

      const setCookieHeader = pageResponse.headers.get('set-cookie');
      this.logger.debug(
        `Initial cookies received: ${setCookieHeader ? this.maskCookie(setCookieHeader) : 'none'}`
      );

      // 解析初始 Cookie
      let initialCookieString = '';
      if (setCookieHeader) {
        const parsedCookies = this.parseAllSetCookies(setCookieHeader);
        initialCookieString = Object.entries(parsedCookies)
          .map(([name, value]) => `${name}=${value}`)
          .join('; ');
        this.logger.debug(`Parsed initial cookies: ${this.maskCookie(initialCookieString)}`);
      }

      // 第二步：提交登录表单
      // baseUrl 已经包含 /a，所以直接拼接 /login
      const loginUrl = baseUrl.endsWith('/a') ? `${baseUrl}/login` : `${baseUrl}/a/login`;

      // JeeSite使用Base64编码用户名和密码
      const encodedUsername = Buffer.from(username).toString('base64');
      const encodedPassword = Buffer.from(password).toString('base64');
      this.logger.debug('Credentials encoded for JeeSite login');

      const formData = new URLSearchParams({
        username: encodedUsername,
        password: encodedPassword,
        validCode: '',
        __url: ''
      });

      this.logger.debug(`Submitting login form to: ${loginUrl}`);
      this.logger.debug('Form data prepared with masked credentials');

      const loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: initialCookieString,
          'User-Agent': DEFAULT_USER_AGENT,
          Referer: loginPageUrl
        },
        body: formData.toString(),
        redirect: 'manual' // 不自动跟随重定向，手动处理
      });

      this.logger.debug(`Login response status: ${loginResponse.status}`);

      // 获取登录响应的 Cookie
      const loginSetCookieHeader = loginResponse.headers.get('set-cookie');
      this.logger.debug(
        `Set-Cookie header: ${loginSetCookieHeader ? this.maskCookie(loginSetCookieHeader) : 'null'}`
      );

      // 302 重定向是正常的，但我们需要从这个响应中提取 session cookie
      if (loginResponse.status === 302 || loginResponse.status === 301) {
        const location = loginResponse.headers.get('location');
        this.logger.debug(`Redirect location: ${location}`);

        // 检查是否重定向到登录失败页面
        if (location && (location.includes('loginFailure') || location.includes('login?'))) {
          this.logger.error(`Login failed: redirected to ${location}`);
          this.logger.error('This usually means:');
          this.logger.error('  1. Invalid username or password');
          this.logger.error(
            '  2. Captcha/verification code is required (due to multiple failed attempts)'
          );
          this.logger.error('  3. Account is locked or restricted');
          this.logger.error('');
          this.logger.error(
            'SOLUTION: Please login manually in browser and update EXTERNAL_API_COOKIE in .env file'
          );
          this.logger.error('See get-cookie-instructions.md for detailed steps');
          return {
            success: false,
            error:
              'Login failed: Captcha required or invalid credentials. Please login manually and update EXTERNAL_API_COOKIE in .env'
          };
        }

        if (!loginSetCookieHeader) {
          this.logger.error('No cookie in redirect response');
          return {
            success: false,
            error: 'No cookie in redirect response'
          };
        }

        // 解析所有 Set-Cookie 头（可能有多个）
        const allCookies = this.parseAllSetCookies(loginSetCookieHeader);
        this.logger.debug(`All cookies from redirect: ${JSON.stringify(Object.keys(allCookies))}`);

        const sessionId = allCookies['jeesite.session.id'];
        if (!sessionId) {
          this.logger.error(
            `No session ID in redirect. Available cookies: ${Object.keys(allCookies).join(', ')}`
          );
          return {
            success: false,
            error: 'No session ID in redirect response'
          };
        }

        this.logger.debug('Session ID obtained from redirect');

        // 验证 Cookie 是否有效
        this.logger.debug('Validating new cookie...');
        const isValid = await this.validateCookie(buildBargainCookie(sessionId));
        if (!isValid) {
          this.logger.error('Login succeeded but cookie validation failed');
          return {
            success: false,
            error: 'Login succeeded but cookie validation failed'
          };
        }

        this.logger.log('Cookie validation successful');

        return {
          success: true,
          cookie: buildBargainCookie(sessionId)
        };
      }

      // 如果不是重定向，检查响应内容
      const responseText = await loginResponse.text();
      if (responseText.includes('loginForm') || responseText.includes('用户名或密码错误')) {
        this.logger.error('Login failed: Invalid credentials or login form still present');
        return {
          success: false,
          error: 'Login failed: Invalid credentials'
        };
      }

      if (!loginSetCookieHeader) {
        this.logger.error('No cookie returned from login');
        return {
          success: false,
          error: 'No cookie returned from login'
        };
      }

      // 解析 Cookie - 处理多个 Set-Cookie 头
      const cookies = this.parseCookies(loginSetCookieHeader);
      this.logger.debug(`Parsed cookies: ${JSON.stringify(Object.keys(cookies))}`);

      const sessionId = cookies['jeesite.session.id'];

      if (!sessionId) {
        this.logger.error(
          `No session ID in login response. Available cookies: ${Object.keys(cookies).join(', ')}`
        );
        return {
          success: false,
          error: 'No session ID in login response'
        };
      }

      this.logger.debug('Session ID obtained');

      // 验证 Cookie 是否有效
      this.logger.debug('Validating new cookie...');
      const isValid = await this.validateCookie(buildBargainCookie(sessionId));
      if (!isValid) {
        this.logger.error('Login succeeded but cookie validation failed');
        return {
          success: false,
          error: 'Login succeeded but cookie validation failed'
        };
      }

      this.logger.log('Cookie validation successful');

      return {
        success: true,
        cookie: buildBargainCookie(sessionId)
      };
    } catch (error) {
      this.logger.error(`Login error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async validateCookie(cookie: string): Promise<boolean> {
    try {
      const baseUrl = process.env.EXTERNAL_API_BASE_URL;
      if (!baseUrl) return false;

      // SSRF 防护:与 doLogin 相同的校验,防止通过 cookie/status 路径绕过。
      try {
        await assertHostnameNotPrivateAsync(new URL(baseUrl).hostname);
      } catch {
        return false;
      }

      const testUrl = `${baseUrl}/bargain/bargainCommodity/listData?pageSize=1&pageNo=1`;

      const response = await fetch(testUrl, {
        headers: {
          Cookie: cookie,
          'x-ajax': 'json'
        }
      });

      if (!response.ok) {
        return false;
      }

      const text = await response.text();
      // 检查是否返回了登录页面
      if (text.includes('loginForm') || text.includes('/a/login')) {
        return false;
      }

      // 检查是否返回了有效的 JSON
      try {
        const data = JSON.parse(text);
        if (
          data &&
          typeof data === 'object' &&
          'result' in data &&
          (data as { result?: unknown }).result === 'login'
        ) {
          return false;
        }
        return data && typeof data === 'object';
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  private parseCookies(setCookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};

    // Set-Cookie 头可能包含多个 cookie，但不能简单用逗号分割
    // 因为 expires 属性也包含逗号。我们需要更智能的解析
    // 通常每个 cookie 以 "name=value" 开始，后面跟着属性（用分号分隔）

    // 先尝试按分号分割，取第一个 name=value 对
    const firstCookie = setCookieHeader.split(';')[0];
    const parts = firstCookie.split('=');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const value = parts.slice(1).join('=').trim(); // 处理值中可能包含 = 的情况
      cookies[name] = value;
      this.logger.debug(`Parsed cookie: ${name}=***`);
    }

    return cookies;
  }

  private parseAllSetCookies(setCookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};

    // Set-Cookie 头可能包含多个 cookie，用逗号分隔
    // 但 expires 属性也包含逗号，所以需要智能分割
    // 策略：寻找 ", " 后面跟着 cookie 名称的模式

    // 简单方法：按 ", " 分割，然后过滤掉看起来像日期的部分
    const parts = setCookieHeader.split(', ');
    let currentCookie = '';

    for (const part of parts) {
      // 如果这部分看起来像一个新的 cookie（包含 =），并且当前有累积的 cookie
      if (part.includes('=') && !part.match(/^\w{3},?\s+\d{1,2}/)) {
        // 处理之前累积的 cookie
        if (currentCookie) {
          this.parseSingleCookie(currentCookie, cookies);
        }
        currentCookie = part;
      } else {
        // 这是当前 cookie 的延续（可能是 expires 日期）
        currentCookie = `${currentCookie}, ${part}`;
      }
    }

    // 处理最后一个 cookie
    if (currentCookie) {
      this.parseSingleCookie(currentCookie, cookies);
    }

    return cookies;
  }

  private parseSingleCookie(cookieString: string, cookies: Record<string, string>): void {
    // 取第一个分号之前的部分（name=value）
    const nameValue = cookieString.split(';')[0];
    const parts = nameValue.split('=');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      cookies[name] = value;
      this.logger.debug(`Parsed cookie: ${name}=***`);
    }
  }

  private maskIdentifier(value: string) {
    if (value.length <= 4) return '***';
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  private maskCookie(value: string) {
    return value.replace(/([^=;\s,]+)=([^;\s,]+)/g, '$1=***');
  }

  // 清除缓存的 Cookie（用于强制重新登录）
  clearCache(): void {
    this.cachedCookie = null;
    this.lastLoginTime = 0;
    // 不重置 failedAttempts，保持速率限制
  }

  async getCookieStatus() {
    const now = Date.now();
    let isValid = false;
    let cookieToTest = this.cachedCookie || process.env.EXTERNAL_API_COOKIE;
    let autoRefreshed = false;
    if (cookieToTest) {
      isValid = await this.validateCookie(cookieToTest);
      if (!isValid) {
        const refreshedCookie = await this.refreshExpiredCookie('status check');
        if (refreshedCookie) {
          cookieToTest = refreshedCookie;
          autoRefreshed = true;
          isValid = true;
        }
      }
    } else {
      const refreshedCookie = await this.refreshExpiredCookie('missing cookie');
      if (refreshedCookie) {
        cookieToTest = refreshedCookie;
        autoRefreshed = true;
        isValid = true;
      }
    }

    const cooldownRemainingMinutes =
      this.failedAttempts >= 3
        ? Math.max(
            0,
            Math.ceil(
              (Math.min(30 * 60 * 1000, 5 * 60 * 1000 * Math.pow(2, this.failedAttempts - 3)) -
                (now - this.lastFailedTime)) /
                1000 /
                60
            )
          )
        : 0;

    return {
      hasCookie: !!cookieToTest,
      maskedCookie: cookieToTest ? this.maskCookie(cookieToTest) : null,
      isValid,
      autoRefreshed,
      username: process.env.EXTERNAL_API_USERNAME
        ? this.maskIdentifier(process.env.EXTERNAL_API_USERNAME)
        : null,
      failedAttempts: this.failedAttempts,
      cooldownMinutes: cooldownRemainingMinutes,
      lastLoginTime: this.lastLoginTime > 0 ? new Date(this.lastLoginTime).toISOString() : null
    };
  }

  async updateManualCookie(cookie: string): Promise<{ success: boolean; error?: string }> {
    const trimmedCookie = cookie.trim();
    if (!trimmedCookie) {
      return { success: false, error: 'Cookie 内容不能为空' };
    }
    const isValid = await this.validateCookie(trimmedCookie);
    if (!isValid) {
      return {
        success: false,
        error: 'Cookie 校验失败，该 Cookie 可能已失效，请重新从浏览器获取。'
      };
    }

    this.cachedCookie = trimmedCookie;
    this.lastLoginTime = Date.now();
    this.failedAttempts = 0; // 手动输入有效 Cookie 后重置失败计数
    await this.saveCookieToCacheFile(trimmedCookie);
    this.logger.log('Manual cookie update validated and saved');
    return { success: true };
  }
}
