import { Injectable, Logger } from '@nestjs/common';

interface LoginResult {
  success: boolean;
  cookie?: string;
  error?: string;
}

@Injectable()
export class AutoLoginService {
  private readonly logger = new Logger(AutoLoginService.name);
  private cachedCookie: string | null = null;
  private lastLoginTime = 0;
  private loginInProgress: Promise<LoginResult> | null = null;
  private failedAttempts = 0;
  private lastFailedTime = 0;

  async ensureValidCookie(forceRefresh = false): Promise<string | null> {
    // 如果最近失败过多次，等待更长时间
    const now = Date.now();
    if (this.failedAttempts >= 3) {
      const timeSinceLastFail = now - this.lastFailedTime;
      const waitTime = Math.min(30 * 60 * 1000, 5 * 60 * 1000 * Math.pow(2, this.failedAttempts - 3)); // 5分钟起，指数增长，最多30分钟
      if (timeSinceLastFail < waitTime) {
        const remainingWait = Math.ceil((waitTime - timeSinceLastFail) / 1000 / 60);
        this.logger.warn(`Too many failed login attempts (${this.failedAttempts}). Please wait ${remainingWait} more minutes or login manually.`);
        // 使用环境变量中的 Cookie（即使可能过期）
        if (process.env.EXTERNAL_API_COOKIE) {
          return process.env.EXTERNAL_API_COOKIE;
        }
        return null;
      } else {
        // 重置失败计数
        this.logger.log('Cooldown period expired, resetting failed attempts counter');
        this.failedAttempts = 0;
      }
    }

    // 如果强制刷新，直接执行登录
    if (forceRefresh) {
      this.logger.log('Force refresh requested, performing auto login');
      return await this.performLogin();
    }

    // 如果有缓存的 Cookie 且未过期（假设 Cookie 有效期 2 小时）
    if (this.cachedCookie && now - this.lastLoginTime < 2 * 60 * 60 * 1000) {
      this.logger.debug('Using cached cookie');
      return this.cachedCookie;
    }

    // 如果有环境变量中的 Cookie，尝试使用（但不完全信任它）
    if (process.env.EXTERNAL_API_COOKIE && !this.cachedCookie) {
      this.logger.debug('Using cookie from environment variable');
      return process.env.EXTERNAL_API_COOKIE;
    }

    // 如果正在登录中，等待登录完成
    if (this.loginInProgress) {
      this.logger.debug('Login in progress, waiting...');
      const result = await this.loginInProgress;
      return result.success ? result.cookie || null : null;
    }

    // 执行自动登录
    this.logger.log('No valid cached cookie, performing auto login');
    return await this.performLogin();
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
      this.logger.error('EXTERNAL_API_USERNAME and EXTERNAL_API_PASSWORD are required for auto login');
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
      this.logger.debug(`Initial cookies received: ${setCookieHeader ? this.maskCookie(setCookieHeader) : 'none'}`);

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
          'Cookie': initialCookieString,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': loginPageUrl
        },
        body: formData.toString(),
        redirect: 'manual' // 不自动跟随重定向，手动处理
      });

      this.logger.debug(`Login response status: ${loginResponse.status}`);

      // 获取登录响应的 Cookie
      const loginSetCookieHeader = loginResponse.headers.get('set-cookie');
      this.logger.debug(`Set-Cookie header: ${loginSetCookieHeader ? this.maskCookie(loginSetCookieHeader) : 'null'}`);

      // 302 重定向是正常的，但我们需要从这个响应中提取 session cookie
      if (loginResponse.status === 302 || loginResponse.status === 301) {
        const location = loginResponse.headers.get('location');
        this.logger.debug(`Redirect location: ${location}`);

        // 检查是否重定向到登录失败页面
        if (location && (location.includes('loginFailure') || location.includes('login?'))) {
          this.logger.error(`Login failed: redirected to ${location}`);
          this.logger.error('This usually means:');
          this.logger.error('  1. Invalid username or password');
          this.logger.error('  2. Captcha/verification code is required (due to multiple failed attempts)');
          this.logger.error('  3. Account is locked or restricted');
          this.logger.error('');
          this.logger.error('SOLUTION: Please login manually in browser and update EXTERNAL_API_COOKIE in .env file');
          this.logger.error('See get-cookie-instructions.md for detailed steps');
          return {
            success: false,
            error: 'Login failed: Captcha required or invalid credentials. Please login manually and update EXTERNAL_API_COOKIE in .env'
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
          this.logger.error(`No session ID in redirect. Available cookies: ${Object.keys(allCookies).join(', ')}`);
          return {
            success: false,
            error: 'No session ID in redirect response'
          };
        }

        this.logger.debug('Session ID obtained from redirect');

        // 构建完整的 Cookie 字符串
        const cookieString = `skinName=skin-green; jeesite.session.id=${sessionId}; pageSize=10; pageNo=1`;

        // 验证 Cookie 是否有效
        this.logger.debug('Validating new cookie...');
        const isValid = await this.validateCookie(cookieString);
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
          cookie: cookieString
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
        this.logger.error(`No session ID in login response. Available cookies: ${Object.keys(cookies).join(', ')}`);
        return {
          success: false,
          error: 'No session ID in login response'
        };
      }

      this.logger.debug('Session ID obtained');

      // 构建完整的 Cookie 字符串
      const cookieString = `skinName=skin-green; jeesite.session.id=${sessionId}; pageSize=10; pageNo=1`;

      // 验证 Cookie 是否有效
      this.logger.debug('Validating new cookie...');
      const isValid = await this.validateCookie(cookieString);
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
        cookie: cookieString
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
      const testUrl = `${baseUrl}/bargain/bargainCommodity/listData?pageSize=1&pageNo=1`;

      const response = await fetch(testUrl, {
        headers: {
          'Cookie': cookie,
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
        currentCookie += ', ' + part;
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
}
